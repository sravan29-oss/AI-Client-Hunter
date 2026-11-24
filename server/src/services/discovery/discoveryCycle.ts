import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { isDatabaseConnected, memoryStore, prisma } from '../../db/prisma';
import { createOrFindLead, findLeadByIdentity, rememberDuplicateDiscovery, rememberOsmIdentity } from '../../db/leadIdentity';
import { config as environment } from '../../config';
import { queueLeadDeliveries } from '../notificationDelivery';
import { generateLocalAuditSynthesis } from '../gemini';
import { notificationService } from '../notificationService';
import { generateProfileOutreach } from '../profileOutreach';
import { qualificationService } from '../qualificationService';
import type { SchedulerConfig } from '../schedulerService';
import { discoveryJobs, type DiscoveryJob, type DiscoveryResult } from './discoveryJobs';
import { discoveryService } from './discoveryService';
import { ProviderFailure } from './providerErrors';
import type { DiscoverySegment } from './discoverySchedule';
import { getBusinessKnowledge } from '../businessKnowledge';
import { scoreProfileMatch } from './profileMatching';
import { profileIsCurrent } from '../idealClientProfiles';
import { enrichBusiness, inspectListedWebsite, listingObservation, publicWebLink } from './businessEnrichment';
import { analyzeOpportunities, classifyLeadScore } from './opportunityAnalysis';
import { withDiscoveryBudget } from './directoryUsage';
import { enqueueGeminiRanking, productionGeminiEnabled } from '../geminiRankingQueue';

export function emptyDiscoveryResult(): DiscoveryResult {
  return {
    status: 'SUCCESS', errorDetails: null,
    discoveredCount: 0, qualifiedCount: 0, duplicatesCount: 0, websitesAuditedCount: 0,
  };
}

export function runDiscoveryCycle(
  config: SchedulerConfig,
  segment: DiscoverySegment,
  canContinue: () => boolean,
  job?: DiscoveryJob,
): Promise<DiscoveryResult> {
  const budget = { job, directoryRequests: 0, geminiRequests: job?.geminiRequestsUsed ?? 0, geminiLimit: environment.DISCOVERY_MAX_GEMINI_REQUESTS_PER_RUN };
  return withDiscoveryBudget(budget, async () => {
    const result = await qualifyDiscovery(config, segment, canContinue, budget, job);
    if (result.metrics) Object.assign(result.metrics, { directoryRequests: budget.directoryRequests, geminiRequests: budget.geminiRequests });
    return result;
  });
}

async function qualifyDiscovery(
  config: SchedulerConfig,
  segment: DiscoverySegment,
  canContinue: () => boolean,
  budget: { directoryRequests: number; geminiRequests: number },
  job?: DiscoveryJob,
): Promise<DiscoveryResult> {
  const result = emptyDiscoveryResult();
  const metrics: NonNullable<DiscoveryResult['metrics']> = {
    providerId: segment.providerUsed, enriched: 0, rejected: 0, inspectionFailures: 0,
    directoryRequests: 0, geminiRequests: 0, rejectionReasons: [], qualifiedLeads: [],
  };
  result.metrics = metrics;
  const snapshot = segment.profileSnapshot ?? undefined;
  if (snapshot && !await profileIsCurrent(snapshot)) return { ...result, status: 'STOPPED', errorDetails: 'The targeting profile changed before discovery.' };
  let search;
  try {
    search = await discoveryService.search({
      country: segment.country,
      city: segment.city || undefined,
      industry: segment.industry,
      maxLeads: config.maxLeadsPerRun,
      providerId: segment.providerUsed,
      jobId: job?.id,
      profileSnapshot: snapshot,
    });
  } catch (error) {
    const failure = error instanceof ProviderFailure ? error : undefined;
    metrics.providerError = failure?.message ?? 'Discovery search failed.';
    if (failure) metrics.providerId = failure.providerId;
    return { ...result, status: 'FAILED', retrySearch: failure?.retryable ?? true, errorDetails: metrics.providerError,
      retryAfterMs: failure?.kind === 'rate_limit' ? Math.max(failure.retryAfterMs ?? 0, 60000) : failure?.retryAfterMs };
  }
  if (search.errors && search.leads.length === 0) {
    return { ...result, status: 'FAILED', retrySearch: true, errorDetails: search.errors };
  }
  metrics.providerId = search.providerId;
  metrics.providerError = search.errors || search.fallbackReason || undefined;
  metrics.rejected = search.filteredOut ?? 0;
  result.discoveredCount = search.leads.length + metrics.rejected;
  if (search.errors) {
    result.status = 'PARTIAL';
    result.errorDetails = search.errors;
  }
  const knowledge = search.leads.length ? await getBusinessKnowledge() : undefined;

  for (const discovered of search.leads) {
    if (!canContinue() || (snapshot && !await profileIsCurrent(snapshot))) return { ...result, status: 'STOPPED', errorDetails: snapshot ? 'The targeting profile changed or the run was stopped.' : null };
    const lead = {
      ...discovered,
      businessName: discovered.businessName.trim(),
      providerId: discovered.providerId || search.providerId,
      providerName: discovered.providerName || search.providerName,
      discoveryDate: discovered.discoveryDate || search.timestamp,
      country: discovered.country || segment.country,
      city: discovered.city || segment.city,
      industry: discovered.industry || segment.industry,
    };
    if (!lead.businessName) continue;
    try {
      const observation = listingObservation(lead);
      const identity = { ...lead, observation };
      const duplicate = await findLeadByIdentity(identity);
      if (duplicate) {
        if (isDatabaseConnected && job) {
          const outcome = await prisma.$transaction(async (tx) => {
            if (!await discoveryJobs.lockForWrite(tx, job)) return 'stopped';
            return await rememberDuplicateDiscovery(identity, tx) ? 'duplicate' : 'continue';
          });
          if (outcome === 'stopped') return { ...result, status: 'STOPPED' };
          if (outcome === 'duplicate') { result.duplicatesCount++; continue; }
        } else {
          const existing = memoryStore.leads.find((item) => item.id === duplicate.id);
          if (existing) {
            existing.lastSeenAt = new Date();
            await rememberOsmIdentity(existing.id, lead.osmObject);
          }
          result.duplicatesCount++;
          continue;
        }
      }

      const inspection = await inspectListedWebsite(lead.website);
      const enriched = enrichBusiness(lead, inspection);
      const evidence = enriched.evidence;
      metrics.enriched++;
      if (evidence) result.websitesAuditedCount++;
      if (inspection.status === 'FAILED') metrics.inspectionFailures++;
      if (!canContinue()) return { ...result, status: 'STOPPED' };

      const candidate = { ...lead, businessEmail: enriched.businessEmail, publicBusinessPhone: enriched.publicBusinessPhone };
      const profileMatch = snapshot && knowledge ? scoreProfileMatch(candidate, snapshot, segment.industry, knowledge, evidence) : undefined;
      const threshold = snapshot?.targeting.minLeadScore ?? config.minOpportunityScore;
      const reject = (reason: string, score?: number) => {
        metrics.rejected++;
        metrics.rejectionReasons.push({ businessName: lead.businessName, reason, score, websiteStatus: inspection.status,
          inspectionError: inspection.status === 'FAILED' ? inspection.detail : undefined });
      };
      if (profileMatch && (!profileMatch.service || profileMatch.score < threshold)) {
        reject(profileMatch.service ? `Below the active profile threshold of ${threshold}.` : 'No target service matches the saved business profile.', profileMatch.score);
        continue;
      }
      const persistent = isDatabaseConnected && Boolean(job);
      const analysis = await analyzeOpportunities({
        ...candidate, inspection, services: profileMatch?.service ? [profileMatch.service] : knowledge?.profile.services ?? [],
      }, { deferGemini: persistent });
      const verifiedProblems = analysis.findings.map((finding) => finding.evidence);
      const audit = evidence ? generateLocalAuditSynthesis({ websiteUrl: evidence.url, companyName: lead.businessName, evidence }) : undefined;
      const qualification = profileMatch ? {
        opportunityScore: profileMatch.score,
        recommendedService: profileMatch.service!,
        suggestedServices: [profileMatch.service!],
        reasonForQualification: `Matched the ${profileMatch.profileName} targeting profile.`,
        evidence: profileMatch.factors.map((factor) => factor.evidence).join(' '),
        suggestedProjectScope: analysis.potentialScope.join(' ') || profileMatch.opportunities.join(' ') || `Explore ${profileMatch.service} if the business expresses interest.`,
        estimatedComplexity: null,
        aiSummary: analysis.businessSummary,
      } : await qualificationService.qualifyLead({ ...candidate, detectedProblems: verifiedProblems, evidence, auditResult: audit }, persistent);
      if (!profileMatch && qualification.opportunityScore < threshold) {
        reject(`Below the configured threshold of ${threshold}.`, qualification.opportunityScore);
        continue;
      }

      const leadId = randomUUID();
      const draft = await generateProfileOutreach({
        leadId,
        companyName: lead.businessName,
        contactName: lead.contactName || undefined,
        websiteUrl: lead.website || undefined,
        industry: lead.industry,
        city: lead.city || undefined,
        country: lead.country,
        targetService: qualification.recommendedService,
        messageType: 'COLD_EMAIL',
        verifiedProblems,
      }, persistent);
      if (!canContinue()) return { ...result, status: 'STOPPED' };

      const leadData = {
        id: leadId, businessName: lead.businessName, website: publicWebLink(lead.website) || null,
        country: lead.country, city: lead.city, industry: lead.industry,
        businessEmail: enriched.businessEmail, contactName: lead.contactName || null,
        publicBusinessPhone: enriched.publicBusinessPhone, source: lead.source,
        osmObject: lead.osmObject, discoveryDate: lead.discoveryDate, observation,
        businessDescription: lead.businessDescription || null, detectedProblems: verifiedProblems,
        suggestedServices: qualification.suggestedServices, opportunityScore: qualification.opportunityScore,
        lastSeenAt: new Date(), qualificationScore: qualification.opportunityScore,
        qualificationReason: qualification.reasonForQualification, qualificationEvidence: qualification.evidence,
        suggestedProjectScope: qualification.suggestedProjectScope,
        estimatedComplexity: qualification.estimatedComplexity, aiSummary: qualification.aiSummary,
        profileMatch,
        leadStatus: 'Qualified' as const, qualificationStatus: 'QUALIFIED', websiteAnalysisStatus: inspection.status,
        discoveryEvidence: JSON.parse(JSON.stringify({ fields: enriched.fields, socialLinks: enriched.socialLinks, inspection: enriched.inspection, analysis,
          classification: classifyLeadScore(qualification.opportunityScore),
          targetLocation: { city: segment.city, country: segment.country }, profileName: snapshot?.profileName })) as Prisma.InputJsonValue,
      };
      const pitchData = {
        id: randomUUID(), leadId, channel: 'COLD_EMAIL' as const, messageType: 'COLD_EMAIL',
        targetService: qualification.recommendedService,
        targetRegion: lead.country.toLowerCase() === 'india' ? 'INDIA' : 'OTHER',
        subject: draft.subject, body: draft.body, personalisedOpening: draft.personalisedOpening,
        observedOpportunity: draft.observedOpportunity, relevantService: draft.relevantService,
        valueProposition: draft.valueProposition, callToAction: draft.callToAction,
        professionalClosing: draft.professionalClosing, status: 'DRAFT' as const,
        metadata: { generatedBy: draft.generatedBy, model: draft.model, isFallback: draft.isFallback, businessProfile: draft.businessProfile },
        followUpSequence: JSON.parse(JSON.stringify(draft.followUpSequence || [])) as Prisma.InputJsonValue,
      };
      const auditData = audit && evidence && lead.website ? {
        id: randomUUID(), leadId, websiteUrl: evidence.url,
        overallScore: audit.overallScore, mobileFriendly: audit.mobileFriendly, speedScore: audit.speedScore,
        techStackDetected: audit.techStackDetected, missingCapabilities: audit.missingCapabilities,
        securityFindings: audit.securityFindings, uiUxIssues: audit.uiUxIssues, pitchHooks: audit.pitchHooks,
        summary: analysis.websiteCondition, rawData: JSON.parse(JSON.stringify({
          evidence: { ...evidence, bodySample: '' }, analysis: audit,
        })) as Prisma.InputJsonValue,
      } : null;

      if (isDatabaseConnected && job) {
        const outcome = await prisma.$transaction(async (tx) => {
          if (!await discoveryJobs.lockForWrite(tx, job)) return 'stopped';
          if (!(await createOrFindLead(leadData, tx)).created) return 'duplicate';
          if (productionGeminiEnabled() && inspection.status === 'ANALYZED' && analysis.opportunities.length) {
            await enqueueGeminiRanking(tx, leadId, inspection.inspectedAt, analysis.opportunities, job.id);
          }
          if (auditData) await tx.auditReport.create({ data: auditData });
          await tx.pitch.create({ data: pitchData });
          if (snapshot || config.notifyInApp) await tx.notification.create({ data: notificationService.describeLeadAlert({
            ...leadData, mainOpportunity: analysis.opportunities[0]?.opportunity,
          }) });
          if (environment.DISCOVERY_EXTERNAL_ALERTS_ENABLED) await queueLeadDeliveries(tx, leadId, config);
          await tx.autoHunterLog.update({ where: { id: job.id }, data: { qualifiedCount: { increment: 1 } } });
          return 'saved';
        });
        if (outcome === 'stopped') return { ...result, status: 'STOPPED' };
        if (outcome === 'duplicate') {
          result.duplicatesCount++;
          continue;
        }
      } else {
        const createdAt = new Date();
        const pitch = { ...pitchData, createdAt, updatedAt: createdAt };
        const report = auditData ? { ...auditData, createdAt } : null;
        memoryStore.leads.unshift({ ...leadData, createdAt, updatedAt: createdAt, pitches: [pitch], audits: report ? [report] : [] });
        memoryStore.pitches.unshift(pitch);
        if (report) memoryStore.audits.unshift(report);
      }

      result.qualifiedCount++;
      metrics.qualifiedLeads.push({ id: leadId, businessName: lead.businessName, score: qualification.opportunityScore });
      if (!isDatabaseConnected && canContinue()) {
        await notificationService.sendLeadAlert(leadData, {
          inApp: Boolean(snapshot) || config.notifyInApp,
          email: environment.DISCOVERY_EXTERNAL_ALERTS_ENABLED && config.notifyEmail,
          telegram: environment.DISCOVERY_EXTERNAL_ALERTS_ENABLED && config.notifyTelegram,
          customEmail: config.notificationEmail || undefined,
          customTelegramChatId: config.telegramChatId || undefined,
        });
      }
    } catch {
      result.status = 'PARTIAL';
      result.errorDetails = 'A prospect could not be processed or saved. Other discovery results are retained.';
    } finally {
      metrics.directoryRequests = budget.directoryRequests;
      metrics.geminiRequests = budget.geminiRequests;
      if (job && canContinue()) await discoveryJobs.publishProgress(job, result);
    }
  }

  return canContinue() ? result : { ...result, status: 'STOPPED' };
}

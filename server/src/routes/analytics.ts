import { Router, Request, Response, NextFunction } from 'express';
import { prisma, isDatabaseConnected, memoryStore } from '../db/prisma';
import { businessRangeSchema } from '../services/businessGrowthCalendar';
import { getBusinessGrowth } from '../services/businessGrowth';
import { getMarketIntelligence } from '../services/marketIntelligence';
import { occurredAtSchema, responseKinds } from '../services/engagementActivity';
import businessReports from './businessReports';

const router = Router();
router.use('/business-growth/reports', businessReports);

router.get('/business-growth/intelligence', async (req, res, next) => {
  try {
    const data = await getMarketIntelligence(businessRangeSchema.parse(req.query));
    res.set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/business-growth', async (req, res, next) => {
  try {
    const range = businessRangeSchema.parse(req.query);
    const data = await getBusinessGrowth(range);
    res.set('Cache-Control', 'no-store').json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/analytics - Aggregated intelligence and pipeline metrics
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summaryOnly = req.query.view === 'summary';
    let leads: any[] = [];
    let pitches: any[] = [];
    let activityLogs: any[] = [];
    let followUps: { status: string; dueAt: Date }[] = [];
    let responses: { action: string; createdAt: Date; pitchId: string | null; leadId: string | null; kind: string | null; occurredAt: string | null }[] = [];
    let campaigns: { id: string; name: string; archivedAt: Date | null }[] = [];

    if (isDatabaseConnected) {
      [leads, pitches, activityLogs, followUps, responses, campaigns] = await Promise.all([
        prisma.lead.findMany({
          ...(summaryOnly ? {} : { orderBy: { createdAt: 'desc' } }),
          select: {
            leadStatus: true, opportunityScore: true, qualificationStatus: true, source: true, country: true, suggestedServices: true,
            ...(!summaryOnly ? { id: true, businessName: true, industry: true, city: true, createdAt: true } : {}),
          },
        }),
        prisma.pitch.findMany({
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, leadId: true, proposal: true, sentAt: true, status: true, campaignId: true, channel: true, messageType: true,
          },
        }),
        prisma.activityLog.findMany({
          orderBy: { createdAt: 'desc' }, take: 10,
          select: { id: true, action: true, createdAt: true },
        }),
        prisma.leadFollowUp.findMany({ select: { status: true, dueAt: true } }),
        prisma.$queryRaw<typeof responses>`
          SELECT "action", "createdAt", "metadata"->>'pitchId' AS "pitchId", "metadata"->>'leadId' AS "leadId",
            "metadata"->>'kind' AS "kind", "metadata"->>'occurredAt' AS "occurredAt"
          FROM "ActivityLog" WHERE "action" IN ('COMMUNICATION_RESPONSE', 'OUTREACH_REPLY_RECORDED')
        `,
        prisma.outreachCampaign.findMany({ select: { id: true, name: true, archivedAt: true }, orderBy: { createdAt: 'desc' } }),
      ]);
    } else {
      leads = memoryStore.leads;
      pitches = memoryStore.pitches;
      activityLogs = memoryStore.logs.slice(0, 10);
    }

    // 1. KPI Calculations based on real Lead schema
    const totalLeads = leads.length;
    const newLeads = leads.filter((l) => l.leadStatus === 'New').length;
    const highPriorityLeads = leads.filter(
      (l) => (l.opportunityScore && l.opportunityScore >= 80)
    ).length;
    const contactedLeads = leads.filter(
      (l) => l.leadStatus === 'Contacted' || l.leadStatus === 'Replied' || l.leadStatus === 'Meeting_Scheduled' || l.leadStatus === 'Negotiation' || l.leadStatus === 'Won'
    ).length;
    const meetingsBooked = leads.filter(
      (l) => l.leadStatus === 'Meeting_Scheduled' || l.leadStatus === 'Negotiation' || l.leadStatus === 'Won'
    ).length;
    const dealsWon = leads.filter((l) => l.leadStatus === 'Won').length;
    const dealsLost = leads.filter((l) => l.leadStatus === 'Lost').length;
    const qualifiedLeads = leads.filter((lead) => lead.qualificationStatus === 'QUALIFIED' || lead.leadStatus === 'Qualified').length;

    // 2. Lead Acquisition Chart Data (by prospecting source)
    const acquisitionBySource = new Map<string, number>();
    for (const l of leads) {
      const src = l.source || 'Manual';
      acquisitionBySource.set(src, (acquisitionBySource.get(src) ?? 0) + 1);
    }

    const leadAcquisitionChart = Array.from(acquisitionBySource, ([name, leadsCount]) => ({
      name,
      leads: leadsCount,
    }));

    // 3. Lead Conversion Funnel Chart Data
    const stageOrder = [
      { key: 'New', label: 'New' },
      { key: 'Analysed', label: 'Analysed' },
      { key: 'Qualified', label: 'Qualified' },
      { key: 'Ready_to_Contact', label: 'Ready to Contact' },
      { key: 'Contacted', label: 'Contacted' },
      { key: 'Replied', label: 'Replied' },
      { key: 'Meeting_Scheduled', label: 'Meeting Scheduled' },
      { key: 'Negotiation', label: 'Negotiation' },
      { key: 'Won', label: 'Won' },
      { key: 'Lost', label: 'Lost' },
    ];

    const leadConversionChart = stageOrder.map((stage) => ({
      stage: stage.label,
      count: leads.filter((l) => l.leadStatus === stage.key).length,
    }));

    // 4. Regional Distribution
    const countryMap = new Map<string, number>();
    for (const lead of leads) {
      const c = lead.country || 'Unknown';
      countryMap.set(c, (countryMap.get(c) ?? 0) + 1);
    }
    const regionDistribution = Array.from(countryMap, ([name, count]) => ({
      name,
      count,
    }));

    // 5. Service Demand Breakdown across the core 6 offerings
    const serviceMap: Record<string, number> = {
      'Business websites': 0,
      'E-commerce websites': 0,
      'React Native mobile applications': 0,
      'Admin dashboards': 0,
      'Backend API development': 0,
      'AI applications and integrations': 0,
    };

    for (const lead of leads) {
      if (Array.isArray(lead.suggestedServices)) {
        for (const s of lead.suggestedServices) {
          if (typeof s !== 'string') continue;
          const lower = s.toLowerCase();
          if (lower.includes('ai ') || lower.includes('artificial intelligence') || lower.includes('gemini')) serviceMap['AI applications and integrations']++;
          else if (lower.includes('commerce') || lower.includes('store')) serviceMap['E-commerce websites']++;
          else if (lower.includes('react native') || lower.includes('mobile'))
            serviceMap['React Native mobile applications']++;
          else if (lower.includes('dashboard') || lower.includes('admin')) serviceMap['Admin dashboards']++;
          else if (lower.includes('backend') || lower.includes('api')) serviceMap['Backend API development']++;
          else if (lower.includes('business') || lower.includes('website')) serviceMap['Business websites']++;
        }
      }
    }

    const serviceBreakdown = Object.entries(serviceMap).map(([service, count]) => ({
      service,
      count,
    }));

    // 6. Recent Leads (top 8)
    const leadSummary = ({ id, businessName, industry, city, country, leadStatus, opportunityScore, createdAt }: typeof leads[number]) => ({
      id, businessName, industry, city, country, leadStatus, opportunityScore, createdAt,
    });
    const recentLeads = summaryOnly ? [] : leads.slice(0, 8).map(leadSummary);

    // 7. Top Opportunities (top 5 sorted by opportunityScore)
    const topOpportunities = summaryOnly ? [] : leads
      .filter((l) => l.leadStatus !== 'Lost' && l.leadStatus !== 'Won')
      .sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0))
      .slice(0, 5).map(leadSummary);

    // 8. Recent Activity
    const outreachPitches = pitches.filter((pitch) => pitch.proposal == null);
    const deliveredById = new Map(pitches.filter((pitch) => pitch.sentAt && pitch.leadId).map((pitch) => [pitch.id, pitch]));
    const validKinds = new Set<string>(responseKinds);
    const now = new Date();
    const recordedReplies = new Set<string>();
    const objectionCounts = new Map<string, number>();
    for (const event of responses) {
      const pitch = deliveredById.get(event.pitchId);
      if (!pitch || event.leadId !== pitch.leadId) continue;
      const recorded = event.action === 'COMMUNICATION_RESPONSE';
      const actual = occurredAtSchema.safeParse(event.occurredAt);
      if (recorded && (!actual.success || !event.kind || !validKinds.has(event.kind))) continue;
      const time = actual.success ? new Date(actual.data) : event.createdAt;
      if (time < new Date(pitch.sentAt) || time > now) continue;
      recordedReplies.add(pitch.id);
      if (recorded && event.kind && ['BUDGET', 'TIMING', 'NOT_INTERESTED', 'OPT_OUT'].includes(event.kind)) {
        objectionCounts.set(event.kind, (objectionCounts.get(event.kind) ?? 0) + 1);
      }
    }
    const sentPitches = outreachPitches.filter((pitch) => Boolean(pitch.sentAt));
    const repliedPitches = sentPitches.filter((pitch) => recordedReplies.has(pitch.id));
    const repliesReceived = new Set(pitches.filter((pitch) => pitch.sentAt && pitch.leadId && recordedReplies.has(pitch.id))
      .map((pitch) => pitch.leadId)).size;
    const communicationMetrics = (items: typeof outreachPitches) => {
      const delivered = items.filter((pitch) => Boolean(pitch.sentAt));
      return {
        drafts: items.filter((pitch) => pitch.status === 'DRAFT').length,
        delivered: delivered.length,
        replied: delivered.filter((pitch) => recordedReplies.has(pitch.id)).length,
        won: delivered.filter((pitch) => pitch.status === 'CONVERTED').length,
      };
    };
    const proposals = pitches.filter(({ proposal }) => proposal && typeof proposal === 'object'
      && !Array.isArray(proposal) && Object.keys(proposal).length > 0);
    const proposalTotals = new Map<string, { currency: string; quotedMinor: number; acceptedMinor: number }>();
    for (const pitch of proposals) {
      const { currency, totalMinor } = pitch.proposal;
      if (!['INR', 'USD'].includes(currency) || !Number.isSafeInteger(totalMinor) || totalMinor < 0) continue;
      const row = proposalTotals.get(currency) ?? { currency, quotedMinor: 0, acceptedMinor: 0 };
      if (pitch.sentAt) row.quotedMinor += totalMinor;
      if (pitch.status === 'CONVERTED') row.acceptedMinor += totalMinor;
      proposalTotals.set(currency, row);
    }
    const pending = followUps.filter((item) => item.status === 'PENDING');
    const closed = dealsWon + dealsLost;

    res.set('Cache-Control', 'no-store').json({
      success: true,
      data: {
        summary: {
          totalLeads,
          newLeads,
          highPriorityLeads,
          contactedLeads,
          repliesReceived,
          meetingsBooked,
          dealsWon,
          qualifiedLeads,
          totalValueInr: 0,
          totalValueUsd: 0,
          wonValueInr: 0,
          wonValueUsd: 0,
          winRatePercentage: closed ? Math.round((dealsWon / closed) * 100) : 0,
        },
        leadAcquisitionChart,
        leadConversionChart,
        regionDistribution,
        serviceBreakdown,
        recentLeads,
        topOpportunities,
        recentActivity: activityLogs.map(({ id, action, createdAt }) => ({
          id, action, createdAt, description: action.toLowerCase().replaceAll('_', ' '),
        })),
        outreachMetrics: {
          totalGenerated: outreachPitches.length,
          sent: sentPitches.length,
          replied: repliedPitches.length,
          converted: outreachPitches.filter((p) => p.status === 'CONVERTED').length,
          replyRatePercentage: sentPitches.length ? Math.round((repliedPitches.length / sentPitches.length) * 100) : 0,
        },
        salesPerformance: {
          won: dealsWon,
          lost: dealsLost,
          proposals: {
            drafts: proposals.filter((item) => item.status === 'DRAFT').length,
            sent: proposals.filter((item) => Boolean(item.sentAt)).length,
            accepted: proposals.filter((item) => item.status === 'CONVERTED').length,
            totals: [...proposalTotals.values()],
          },
          followUps: {
            pending: pending.length,
            due: pending.filter((item) => item.dueAt <= now).length,
            completed: followUps.filter((item) => item.status === 'COMPLETED').length,
            cancelled: followUps.filter((item) => item.status === 'CANCELLED').length,
          },
        },
        engagementPerformance: {
          channels: ['COLD_EMAIL', 'WHATSAPP', 'LINKEDIN', 'UPWORK_PROPOSAL'].map((channel) => ({
            id: channel, ...communicationMetrics(outreachPitches.filter((pitch) =>
              pitch.channel === channel && pitch.messageType !== 'INSTAGRAM_DM')),
          })),
          campaigns: campaigns.map((campaign) => ({
            ...campaign, ...communicationMetrics(outreachPitches.filter((pitch) => pitch.campaignId === campaign.id)),
          })),
          objections: [...objectionCounts].map(([kind, count]) => ({ kind, count })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

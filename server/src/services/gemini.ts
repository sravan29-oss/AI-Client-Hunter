import axios from 'axios';
import { takeGeminiRequest } from './discovery/directoryUsage';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';
import { logger } from '../utils/logger';

let genAI: GoogleGenerativeAI | null = null;
if (config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim() !== '') {
  try {
    genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  } catch (err) {
    logger.error('Gemini client initialization failed.');
  }
}

import { WebsiteEvidence } from './scraper';

export interface AuditPromptInput {
  websiteUrl: string;
  companyName?: string;
  pageTitle?: string;
  metaDescription?: string;
  detectedTech?: string[];
  hasViewport?: boolean;
  hasSsl?: boolean;
  headings?: string[];
  bodySample?: string;
  targetServices?: string[];
  evidence?: WebsiteEvidence;
}

export interface WebsiteAnalysisResult {
  overallScore: number;
  speedScore: number;
  mobileScore: number;
  seoScore: number;
  accessibilityScore: number;

  websiteSummary: string;

  designImprovements: Array<{
    issue: string;
    evidence: string;
    recommendation: string;
  }>;

  mobileExperienceIssues: Array<{
    issue: string;
    evidence: string;
    recommendation: string;
  }>;

  seoIssues: Array<{
    issue: string;
    evidence: string;
    recommendation: string;
  }>;

  missingFeatures: Array<{
    feature: string;
    evidence: string;
    businessImpact: string;
  }>;

  businessOpportunities: Array<{
    opportunity: string;
    rationale: string;
    potentialValue: string;
  }>;

  servicesOffered: Array<{
    service: string;
    reason: string;
    scopeOfWork: string;
  }>;

  personalizedFirstContact: {
    channel: string;
    subjectLine?: string;
    openingHook: string;
    fullMessage: string;
  };
  firstContactSuggestion?: {
    channel: string;
    subjectLine?: string;
    openingHook: string;
    fullMessage: string;
  };

  // Backwards compatibility mappings for existing records
  mobileFriendly: boolean;
  techStackDetected: string[];
  missingCapabilities: string[];
  securityFindings: string[];
  uiUxIssues: string[];
  pitchHooks: string[];
  summary: string;
  generatedBy: 'gemini' | 'evidence_fallback';
  model: string | null;
  isFallback: boolean;
}

export type OutreachMessageType =
  | 'COLD_EMAIL'
  | 'WHATSAPP_MESSAGE'
  | 'LINKEDIN_CONNECT'
  | 'LINKEDIN_FOLLOWUP'
  | 'INSTAGRAM_DM'
  | 'FREELANCE_PROPOSAL'
  | 'PROJECT_INTRO'
  | 'FOLLOW_UP';

export interface OutreachPromptInput {
  leadId?: string;
  companyName: string;
  contactName?: string;
  websiteUrl?: string;
  industry?: string;
  city?: string;
  country?: string;
  targetRegion?: 'INDIA' | 'US' | 'UK' | 'EUROPE' | 'OTHER' | string;
  targetService: string;
  messageType: OutreachMessageType | string;
  tone?: string;
  verifiedProblems?: string[];
  auditSummary?: string;
  auditEvidence?: WebsiteEvidence;
  freelancerName?: string;
}

export interface GeneratedOutreachResult {
  subject: string;
  subjectLine?: string;
  body: string;
  personalisedOpening: string;
  observedOpportunity: string;
  relevantService: string;
  valueProposition: string;
  callToAction: string;
  professionalClosing: string;
  messageType: string;
  followUpSequence?: Array<{
    delayDays: number;
    subject: string;
    body: string;
    channel?: string;
  }>;
  generatedBy: 'gemini' | 'evidence_fallback';
  model: string | null;
  isFallback: boolean;
}

export interface PitchPromptInput {
  companyName: string;
  contactName?: string;
  websiteUrl?: string;
  targetService: string;
  targetRegion: 'INDIA' | 'US' | 'UK' | 'EUROPE' | 'OTHER' | string;
  channel: 'COLD_EMAIL' | 'LINKEDIN' | 'WHATSAPP' | 'UPWORK_PROPOSAL' | string;
  messageType?: OutreachMessageType | string;
  tone?: string;
  auditSummary?: string;
  pitchHooks?: string[];
  verifiedProblems?: string[];
  freelancerName?: string;
  leadId?: string;
}

export interface ProspectScanInput {
  region: 'INDIA' | 'US' | 'UK' | 'EUROPE' | 'OTHER';
  industry: string;
  services: string[];
  city?: string;
  targetType?: string;
}

// Strict evidence-grounded local outreach synthesis generator
function generateLocalOutreachSynthesis(input: OutreachPromptInput): GeneratedOutreachResult {
  const company = input.companyName || 'your business';
  const contact = input.contactName?.trim() || '';
  const greeting = contact ? `Hi ${contact}` : `Hi ${company} Team`;
  const service = input.targetService || 'Business website';
  const industry = input.industry || 'technology';
  const freelancer = input.freelancerName || 'Senior Full-Stack Software Engineer & Architect';

  // 1. Personalised Opening (Strict: Never pretend past relationship or prior talks)
  let opening = '';
  switch (input.messageType) {
    case 'LINKEDIN_CONNECT':
      opening = contact
        ? `Hi ${contact}, I came across your work with ${company} in the ${industry} space and wanted to connect.`
        : `Hi there, I came across ${company}'s work in the ${industry} space and wanted to connect with your team.`;
      break;
    case 'LINKEDIN_FOLLOWUP':
      opening = contact
        ? `Hi ${contact}, I wanted to share a brief idea for ${company}.`
        : `Hi ${company} team, I wanted to share a brief project idea.`;
      break;
    case 'INSTAGRAM_DM':
      opening = contact
        ? `Hey ${contact}! Really appreciate the work you and your team are putting out for ${company}.`
        : `Hey ${company} team! Really appreciate what you're building in the ${industry} space.`;
      break;
    case 'WHATSAPP_MESSAGE':
      opening = contact ? `Hi ${contact},` : `Hi ${company} team,`;
      break;
    case 'FREELANCE_PROPOSAL':
      opening = contact
        ? `Hello ${contact}, I am writing to submit a tailored technical proposal for ${company}'s ${industry} platform.`
        : `Hello ${company} Hiring Team, I am submitting a tailored technical proposal for your ${industry} platform.`;
      break;
    case 'PROJECT_INTRO':
      opening = contact
        ? `Dear ${contact}, I have put together a focused technical project brief tailored for ${company}.`
        : `Dear ${company} Leadership, I have put together a focused technical project brief tailored for your platform.`;
      break;
    case 'FOLLOW_UP':
      opening = contact
        ? `Hi ${contact}, just checking in briefly regarding ${company}'s digital roadmap.`
        : `Hi ${company} Team, just checking in briefly regarding your digital platform roadmap.`;
      break;
    case 'COLD_EMAIL':
    default:
      opening = contact
        ? `Hi ${contact},\n\nI came across ${company} while looking at ${industry} businesses.`
        : `Hi ${company} Team,\n\nI came across your business while looking at ${industry} companies.`;
      break;
  }

  // 2. Specific Observed Business Opportunity (Strict: Never invent problems)
  let opportunity = '';
  if (input.verifiedProblems && input.verifiedProblems.length > 0) {
    const verified = input.verifiedProblems.slice(0, 2).join(' and ');
    opportunity = `From evaluating your public web presence, I observed that ${verified.toLowerCase()}, which can create friction for prospective clients looking to book or enquire.`;
  } else if (input.auditSummary) {
    opportunity = `From reviewing your platform metrics, ${input.auditSummary.toLowerCase().replace(/^(the|this)\s+/, '')}.`;
  } else {
    opportunity = `I’d like to learn whether ${service.toLowerCase()} could help with a goal you are working toward.`;
  }

  // 3. Relevant Service I Can Offer
  let serviceDesc = '';
  switch (service) {
    case 'Business website':
    case 'Business websites':
      serviceDesc = 'I offer website development. We can discuss responsive design and practical ways for customers to get in touch.';
      break;
    case 'E-commerce website':
    case 'E-commerce websites':
      serviceDesc = 'I offer e-commerce development. We can decide which catalogue, checkout, and order features your business needs.';
      break;
    case 'React Native mobile application':
    case 'React Native mobile applications':
      serviceDesc = `I build cross-platform iOS and Android mobile applications using React Native, enabling push notifications, mobile bookings, and offline capabilities.`;
      break;
    case 'Admin dashboard':
    case 'Admin dashboards':
      serviceDesc = `I construct role-based internal admin dashboards with real-time analytics, lead pipeline tracking, and operational automation to eliminate manual spreadsheet work.`;
      break;
    case 'Backend API development':
      serviceDesc = `I architect scalable Node.js and PostgreSQL backend APIs with robust authentication, webhook integrations, and high-concurrency data endpoints.`;
      break;
    case 'AI application and integration':
    case 'AI applications and integrations':
      serviceDesc = `I implement tailored AI applications using the Gemini API to automate client triage, smart search, and 24/7 intelligent customer interactions.`;
      break;
    default:
      serviceDesc = `I provide end-to-end full-stack engineering to design, build, and deploy high-performance ${service.toLowerCase()} solutions.`;
      break;
  }

  // 4. Short Value Proposition (Strict: Never guarantee revenue growth)
  const valueProp = 'We can agree on a focused first step based on your customers’ needs and your team’s priorities.';

  // 5. Clear Call to Action (Strict: Low-pressure, clear next step)
  let cta = '';
  if (input.messageType === 'LINKEDIN_CONNECT') {
    cta = `Would love to connect and follow ${company}'s updates!`;
  } else if (input.messageType === 'INSTAGRAM_DM') {
    cta = `Would love to share a quick 2-minute overview if you're open to exploring this. No pressure at all!`;
  } else {
    cta = `Would you be open to a short discussion about what would be useful for ${company}?`;
  }

  // 6. Professional Closing
  const closing = `Best regards,\n${freelancer}`;

  // Subject line
  let subject = '';
  if (input.messageType === 'COLD_EMAIL') {
    subject = `Quick observation regarding ${company}'s digital platform`;
  } else if (input.messageType === 'FREELANCE_PROPOSAL') {
    subject = `Freelance ${service} Proposal for ${company}`;
  } else if (input.messageType === 'PROJECT_INTRO') {
    subject = `Technical Roadmap & ${service} Architecture for ${company}`;
  } else if (input.messageType === 'FOLLOW_UP') {
    subject = `Following up regarding ${company}'s web platform`;
  } else {
    subject = `${service} for ${company}`;
  }

  // Assemble fullMessage
  let fullMessage = '';
  if (input.messageType === 'LINKEDIN_CONNECT') {
    fullMessage = `${opening} I’d be interested in talking about ${service.toLowerCase()}. ${cta}`;
    if (fullMessage.length > 295) {
      fullMessage = `${greeting}, noticed ${company}'s work in ${industry}. Would love to connect and share ideas on ${service.toLowerCase()} optimizations.`;
    }
  } else if (input.messageType === 'INSTAGRAM_DM') {
    fullMessage = `${opening}\n\n${opportunity}\n\n${serviceDesc}\n\n${cta}\n\n${closing}`;
  } else {
    fullMessage = `${opening}\n\n${opportunity}\n\n${serviceDesc}\n\n${valueProp}\n\n${cta}\n\n${closing}`;
  }

  return {
    subject,
    subjectLine: subject,
    body: fullMessage,
    personalisedOpening: opening,
    observedOpportunity: opportunity,
    relevantService: serviceDesc,
    valueProposition: valueProp,
    callToAction: cta,
    professionalClosing: closing,
    messageType: input.messageType,
    followUpSequence: [
      {
        delayDays: 3,
        channel: 'Email',
        subject: `Re: ${subject}`,
        body: `Hi ${contact || 'there'},\n\nI’m available to talk through your project priorities if that would be useful.\n\nBest regards,\n${freelancer}`,
      },
      {
        delayDays: 7,
        channel: 'Email',
        subject: `Resource for ${company}`,
        body: `Hi ${contact || 'there'},\n\nIf this is relevant to your plans, I’d be happy to discuss a practical first step.\n\nBest,\n${freelancer}`,
      },
    ],
    generatedBy: 'evidence_fallback',
    model: null,
    isFallback: true,
  };
}

const meaningfulText = z.string().trim().min(1).max(12000);
const score = z.number().min(0).max(100);
const issue = z.object({ issue: meaningfulText, evidence: meaningfulText, recommendation: meaningfulText });
const auditOutput = z.object({
  overallScore: score, speedScore: score, mobileScore: score, seoScore: score, accessibilityScore: score,
  websiteSummary: meaningfulText,
  designImprovements: z.array(issue).max(25),
  mobileExperienceIssues: z.array(issue).max(25),
  seoIssues: z.array(issue).max(25),
  missingFeatures: z.array(z.object({ feature: meaningfulText, evidence: meaningfulText, businessImpact: meaningfulText })).max(25),
  businessOpportunities: z.array(z.object({ opportunity: meaningfulText, rationale: meaningfulText, potentialValue: meaningfulText })).max(25),
  servicesOffered: z.array(z.object({ service: meaningfulText, reason: meaningfulText, scopeOfWork: meaningfulText })).max(15),
  personalizedFirstContact: z.object({
    channel: meaningfulText, subjectLine: meaningfulText.optional(), openingHook: meaningfulText, fullMessage: meaningfulText,
  }),
});
const outreachOutput = z.object({
  subject: z.string().trim().max(300).optional(),
  body: meaningfulText,
  personalisedOpening: meaningfulText,
  observedOpportunity: meaningfulText,
  relevantService: meaningfulText,
  valueProposition: meaningfulText,
  callToAction: meaningfulText,
  professionalClosing: meaningfulText,
  followUpSequence: z.array(z.object({
    delayDays: z.number().int().min(1).max(365),
    subject: z.string().trim().max(300),
    body: meaningfulText,
    channel: z.string().trim().max(50).optional(),
  })).max(10).default([]),
});

function parseModelResponse<T>(schema: z.ZodType<T>, text: string): T {
  if (text.length > 256000) throw new Error('Gemini output exceeded its size limit.');
  return schema.parse(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
}

function transportDiagnostic(error: unknown) {
  if (axios.isAxiosError(error)) return error.response?.status ?? error.code ?? 'network_error';
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') return error.status;
  return 'transport_error';
}

export async function callGemini(prompt: string, systemInstruction: string): Promise<string> {
  const key = config.GEMINI_API_KEY.trim();
  if (genAI) {
    if (!await takeGeminiRequest()) throw new AppError('The discovery run reached its Gemini request limit.', 429);
    try {
      const model = genAI.getGenerativeModel({
        model: config.GEMINI_MODEL, systemInstruction,
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      }, { timeout: 15000 });
      const response = await model.generateContent(prompt);
      const text = response.response.text()?.trim();
      if (text) return text;
    } catch (error) {
      logger.warn('Gemini SDK request failed.', { status: transportDiagnostic(error) });
    }
    throw new AppError('Gemini returned no usable response.', 502);
  }

  if (!await takeGeminiRequest()) throw new AppError('The discovery run reached its Gemini request limit.', 429);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent`;
    const response = await axios.post(url, {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
    }, {
      headers: { 'x-goog-api-key': key },
      timeout: 15000, maxContentLength: 512000, maxRedirects: 0,
    });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text === 'string' && text.trim()) return text;
  } catch (error) {
    logger.warn('Gemini REST request failed.', { status: transportDiagnostic(error) });
  }

  throw new AppError('Gemini returned no usable response.', 502);
}

// Evidence-grounded synthesis generator when GEMINI_API_KEY is not configured or offline
export function generateLocalAuditSynthesis(input: AuditPromptInput): WebsiteAnalysisResult {
  const evidence = input.evidence;
  const summary = evidence
    ? 'The inspected page returned HTTP ' + evidence.statusCode + ' over ' + (evidence.isHttps ? 'HTTPS' : 'HTTP') + ' in ' + evidence.loadTimeMs + ' ms.'
    : 'Website inspection evidence is unavailable.';
  const designImprovements = evidence?.emptyNavLinksCount ? [{
    issue: 'Review navigation placeholders',
    evidence: evidence.emptyNavLinksCount + ' navigation anchors in the downloaded HTML have empty or placeholder destinations.',
    recommendation: 'Check their behavior in a browser and replace any confirmed placeholders.',
  }] : [];
  const mobileExperienceIssues = evidence && !evidence.isResponsiveReady ? [{
    issue: 'Review mobile viewport',
    evidence: evidence.hasViewport ? 'The viewport tag omits width=device-width.' : 'The inspected page does not have a viewport tag.',
    recommendation: 'Configure the viewport and test the page at mobile widths.',
  }] : [];
  const seoIssues = evidence ? [
    ...(evidence.pageTitleStatus === 'missing' ? [{ issue: 'Missing title', evidence: 'No title was detected on the inspected page.', recommendation: 'Add a descriptive title.' }] : []),
    ...(evidence.metaDescriptionStatus === 'missing' ? [{ issue: 'Missing description', evidence: 'No description metadata was detected on the inspected page.', recommendation: 'Add a descriptive summary.' }] : []),
    ...(evidence.imagesMissingAltCount > 0 ? [{
      issue: 'Review image alternative text',
      evidence: evidence.imagesMissingAltCount + ' image elements have missing or empty alternative text.',
      recommendation: 'Distinguish decorative images from images needing description.',
    }] : []),
  ] : [];
  const findings = [...designImprovements, ...mobileExperienceIssues, ...seoIssues];
  const speedScore = evidence ? Math.max(0, Math.min(100, Math.round(100 - evidence.loadTimeMs / 50))) : 0;
  const mobileScore = evidence ? (evidence.isResponsiveReady ? 90 : 45) : 0;
  const seoScore = evidence ? Math.max(0, 90 - seoIssues.length * 15) : 0;
  const accessibilityScore = evidence ? Math.max(0, 90 - (evidence.hasHtmlLang ? 0 : 10) - Math.min(30, evidence.imagesMissingAltCount * 3)) : 0;
  const personalizedFirstContact = {
    channel: 'Cold Email / LinkedIn',
    openingHook: evidence ? 'I reviewed the public page of your website.' : 'I would be glad to learn more about your website goals.',
    fullMessage: evidence && findings.length
      ? 'I reviewed a public page of your website. ' + findings[0].evidence + ' Would you be open to discussing it?'
      : 'Would you be open to a short conversation about your website priorities?',
  };
  return {
    overallScore: Math.round((speedScore + mobileScore + seoScore + accessibilityScore) / 4),
    speedScore, mobileScore, seoScore, accessibilityScore, websiteSummary: summary, designImprovements,
    mobileExperienceIssues, seoIssues, missingFeatures: [], missingCapabilities: [],
    businessOpportunities: findings.map((finding) => ({ opportunity: finding.issue, rationale: finding.evidence, potentialValue: finding.recommendation })),
    servicesOffered: findings.length ? [{ service: 'Website development', reason: findings[0].evidence, scopeOfWork: findings[0].recommendation }] : [],
    personalizedFirstContact, firstContactSuggestion: personalizedFirstContact,
    mobileFriendly: evidence?.isResponsiveReady ?? false, techStackDetected: evidence?.detectedTech ?? [],
    securityFindings: evidence ? [evidence.isHttps ? 'The inspected page loaded over HTTPS.' : 'The inspected page loaded over HTTP.'] : [],
    uiUxIssues: designImprovements.map((finding) => finding.evidence), pitchHooks: findings.map((finding) => finding.evidence),
    summary, generatedBy: 'evidence_fallback', model: null, isFallback: true,
  };
}

export class GeminiService {
  /**
   * Run in-depth tech and business audit on website signals
   */
  async analyzeWebsite(input: AuditPromptInput): Promise<WebsiteAnalysisResult> {
    return this.auditWebsite(input);
  }

  async auditWebsite(input: AuditPromptInput): Promise<WebsiteAnalysisResult> {
    if (!input.evidence) return generateLocalAuditSynthesis(input);
    if (!config.GEMINI_API_KEY?.trim()) {
      logger.info('GEMINI_API_KEY not configured. Using evidence-grounded local synthesis engine for website audit.');
      return generateLocalAuditSynthesis(input);
    }

    const ev = input.evidence;
    // Keep arbitrary page content, URLs, contacts and extracted text out of the model input.
    const evidenceSummary = JSON.stringify(ev ? {
      httpStatus: ev.statusCode, usedHttps: ev.isHttps, measurementMs: ev.loadTimeMs, htmlBytes: ev.htmlSizeBytes,
      titleStatus: ev.pageTitleStatus, descriptionStatus: ev.metaDescriptionStatus, hasViewport: ev.hasViewport,
      hasDeviceWidth: ev.hasDeviceWidth, headingCount: ev.h1Count, navigationItems: ev.navLinksCount,
      navigationPlaceholders: ev.emptyNavLinksCount, imagesWithMissingAlt: ev.imagesMissingAltCount,
      hasContactForm: ev.hasContactForm, publicEmailLinks: ev.emailsFound.length, publicPhoneLinks: ev.phonesFound.length,
    } : { inspection: 'unavailable' });

    const prompt = `
You are a senior full-stack software engineer and freelance technical consultant auditing a prospective client's website.
Analyse the measured technical evidence below and generate an expert diagnostic report.

${evidenceSummary}

CRITICAL RULES:
1. Every finding must include supporting evidence from the collected data above.
2. An HTTP timing is one observation. HTTPS describes transport only. Keep unavailable observations unknown.
3. Scope observations to the single inspected page. Do not infer missing applications, ordering, appointments, security problems, estimated budgets, or commercial outcomes.
4. Services offered MUST be chosen from the freelancer's 6 core offerings:
   - "Business websites"
   - "E-commerce websites"
   - "React Native mobile applications"
   - "Admin dashboards"
   - "Backend API development"
   - "AI applications and integrations"

Output ONLY a valid, strict JSON object (no markdown, no backticks, no prose outside JSON) with this exact schema:
{
  "overallScore": number (0-100),
  "speedScore": number (0-100),
  "mobileScore": number (0-100),
  "seoScore": number (0-100),
  "accessibilityScore": number (0-100),
  "websiteSummary": "Factual 2-3 sentence summary of what the business does and what the website currently presents",
  "designImprovements": [
    { "issue": "string", "evidence": "string citing exact data", "recommendation": "string" }
  ],
  "mobileExperienceIssues": [
    { "issue": "string", "evidence": "string citing exact data", "recommendation": "string" }
  ],
  "seoIssues": [
    { "issue": "string", "evidence": "string citing exact data", "recommendation": "string" }
  ],
  "missingFeatures": [
    { "feature": "string", "evidence": "string citing exact data", "businessImpact": "string" }
  ],
  "businessOpportunities": [
    { "opportunity": "string", "rationale": "string", "potentialValue": "string" }
  ],
  "servicesOffered": [
    { "service": "One of the 6 core services", "reason": "string", "scopeOfWork": "string" }
  ],
  "personalizedFirstContact": {
    "channel": "Cold Email / LinkedIn",
    "subjectLine": "string",
    "openingHook": "string referencing genuine findings",
    "fullMessage": "string ready to send"
  }
}
`;

    try {
      const raw = await callGemini(prompt, 'Generate a factual website audit from the supplied evidence. Output JSON only.');
      const parsed = parseModelResponse(auditOutput, raw);

      // Fill compatibility fields
      return {
        ...parsed,
        firstContactSuggestion: parsed.personalizedFirstContact,
        mobileFriendly: parsed.mobileScore >= 70,
        techStackDetected: ev?.detectedTech || ['Standard Web Architecture'],
        missingCapabilities: (parsed.missingFeatures || []).map((f: any) => `${f.feature}: ${f.businessImpact}`),
        securityFindings: ev?.isHttps ? ['HTTPS enabled with valid SSL/TLS certificate.'] : ['Insecure HTTP protocol without encryption.'],
        uiUxIssues: (parsed.designImprovements || []).map((d: any) => `${d.issue}: ${d.evidence}`),
        pitchHooks: [
          parsed.personalizedFirstContact?.openingHook || `Tested website performance and measured ${ev?.loadTimeMs || 1000}ms response time.`,
          `Detected ${ev?.detectedTech?.join(', ') || 'web architecture'} with ${ev?.imagesMissingAltCount || 0} images missing alt text.`,
          `Identified opportunities for automated lead capture and conversion rate optimization.`,
        ],
        summary: parsed.websiteSummary || 'Website analysis complete.',
        generatedBy: 'gemini',
        model: config.GEMINI_MODEL,
        isFallback: false,
      };
    } catch {
      logger.warn('Website audit used local synthesis after a Gemini transport or validation failure.');
      return generateLocalAuditSynthesis(input);
    }
  }

  /**
   * AI Outreach Generator: Produces ethical, evidence-grounded messages across 7 outreach formats.
   */
  async generateOutreach(input: OutreachPromptInput, localOnly = false): Promise<GeneratedOutreachResult> {
    if (localOnly) return generateLocalOutreachSynthesis(input);
    if (!config.GEMINI_API_KEY?.trim()) {
      logger.info('No GEMINI_API_KEY set; using evidence-grounded local synthesis for outreach generation.');
      return generateLocalOutreachSynthesis(input);
    }

    const company = input.companyName || 'the target business';
    const contact = input.contactName?.trim() || 'Team';
    const service = input.targetService || 'Business website';
    const messageType = input.messageType || 'COLD_EMAIL';
    const region = input.targetRegion || 'INDIA';
    const isIndia = region === 'INDIA';

    const systemInstruction = `You are a senior full-stack software engineer and client acquisition architect generating high-converting, ethical freelance outreach messages.

CRITICAL RULES & GUARDRAILS:
1. NEVER invent personal relationships or previous conversations. Do NOT pretend to be an old acquaintance or say "it was great chatting earlier".
2. NEVER claim to have spoken with the business, attended their meetings, or received their calls.
3. NEVER invent website problems. Only cite verified empirical observations provided in the prompt. If no problems are observed, focus on genuine positive opportunities to expand their digital presence.
4. NEVER guarantee business growth (do not promise "$50k extra revenue", "guaranteed 10x ROI", etc.). Use realistic value propositions like "streamlines client booking" or "removes manual friction".
5. TONE: Professional, friendly, confident, and natural. Not pushy, not generic, not robotic.
6. The application adds the sender identity, portfolio and project evidence. Leave URLs, sender capabilities, project details, results, and case studies out of the draft suggestions.
7. FORMAT: Output pure JSON with the exact requested schema.`;

    const prompt = `
Generate a personalised outreach message for freelance services.

TARGET CLIENT DATA:
- Company Name: ${company}
- Contact / Decision Maker: ${contact}
- Website: ${input.websiteUrl || 'N/A'}
- Industry: ${input.industry || 'Technology / Commercial'}
- Location: ${input.city || ''} ${input.country || (isIndia ? 'India' : 'International')}
- Target Service to Pitch: ${service} (One of: Business websites, E-commerce websites, React Native mobile applications, Admin dashboards, Backend API development, AI applications and integrations)
- Outreach Format: ${messageType} (Options: COLD_EMAIL, LINKEDIN_CONNECT, LINKEDIN_FOLLOWUP, INSTAGRAM_DM, FREELANCE_PROPOSAL, PROJECT_INTRO, FOLLOW_UP)
- Desired Tone: ${input.tone || 'Professional, friendly, confident and natural'}
- Verified Problems / Audit Observations:
${(input.verifiedProblems || []).join('\n') || input.auditSummary || 'No technical bugs reported; focus on expansion opportunities.'}

FORMAT GUIDELINES:
- If LINKEDIN_CONNECT: Must be concise (under 300 characters total) for high acceptance rate.
- If COLD_EMAIL: Include a compelling subject line and 3-4 structured, punchy paragraphs (~150-200 words).
- If INSTAGRAM_DM: Professional, casual, and friendly direct message (~80-120 words).
- If FREELANCE_PROPOSAL: Detailed, structured proposal highlighting deliverables and engineering quality (~220-300 words).
- If PROJECT_INTRO: Strategic executive project brief (~180-250 words).
- If FOLLOW_UP / LINKEDIN_FOLLOWUP: Polite, low-pressure check-in (~80-120 words).

Every draft MUST include these exact 6 elements:
1. Personalised opening
2. Specific observed business opportunity
3. Relevant service I can offer
4. Short value proposition
5. Clear call to action
6. Professional closing

Return ONLY a strict JSON object with these keys:
{
  "subject": "string (Subject line for email, proposal, or intro)",
  "personalisedOpening": "string",
  "observedOpportunity": "string",
  "relevantService": "string",
  "valueProposition": "string",
  "callToAction": "string",
  "professionalClosing": "string",
  "body": "string (Complete ready-to-send assembled draft with proper paragraph breaks)",
  "followUpSequence": [
    {
      "delayDays": 3,
      "subject": "string",
      "body": "string"
    },
    {
      "delayDays": 7,
      "subject": "string",
      "body": "string"
    }
  ]
}
`;

    try {
      const raw = await callGemini(prompt, systemInstruction);
      const parsed = parseModelResponse(outreachOutput, raw);

      return {
        subject: parsed.subject || `${service} for ${company}`,
        subjectLine: parsed.subject || `${service} for ${company}`,
        body: parsed.body,
        personalisedOpening: parsed.personalisedOpening || '',
        observedOpportunity: parsed.observedOpportunity || '',
        relevantService: parsed.relevantService || '',
        valueProposition: parsed.valueProposition || '',
        callToAction: parsed.callToAction || '',
        professionalClosing: parsed.professionalClosing || '',
        messageType,
        followUpSequence: parsed.followUpSequence || [],
        generatedBy: 'gemini',
        model: config.GEMINI_MODEL,
        isFallback: false,
      };
    } catch {
      logger.warn('Outreach used local synthesis after a Gemini transport or validation failure.');
      return generateLocalOutreachSynthesis(input);
    }
  }

  /**
   * Legacy pitch wrapper
   */
  async generateOutreachPitch(input: PitchPromptInput) {
    const messageType = input.messageType || input.channel || 'COLD_EMAIL';
    return this.generateOutreach({
      companyName: input.companyName,
      contactName: input.contactName,
      websiteUrl: input.websiteUrl,
      targetService: input.targetService,
      targetRegion: input.targetRegion,
      messageType,
      tone: input.tone,
      verifiedProblems: input.verifiedProblems || input.pitchHooks,
      auditSummary: input.auditSummary,
      freelancerName: input.freelancerName,
      leadId: input.leadId,
    });
  }

  /**
   * Discover and generate structured target prospects based on criteria
   */
  async scanProspects(input: ProspectScanInput) {
    const { discoveryService } = await import('./discovery/discoveryService');
    const countries = { INDIA: 'India', US: 'United States', UK: 'United Kingdom', EUROPE: 'Europe', OTHER: 'International' };
    const result = await discoveryService.search({
      country: countries[input.region], city: input.city, industry: input.industry,
      servicesRequired: input.services, maxLeads: 6,
    });
    return result.leads;
  }
}

export const geminiService = new GeminiService();

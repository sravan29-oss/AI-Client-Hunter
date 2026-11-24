import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { config } from '../config';
import { logger } from '../utils/logger';
import { WebsiteEvidence } from './scraper';
import { WebsiteAnalysisResult } from './gemini';
import { takeGeminiRequest } from './discovery/directoryUsage';

export interface LeadQualificationInput {
  businessName: string;
  website?: string | null;
  industry: string;
  country?: string | null;
  city?: string | null;
  businessDescription?: string | null;
  detectedProblems?: string[];
  evidence?: WebsiteEvidence;
  auditResult?: WebsiteAnalysisResult;
}

export interface LeadQualificationResult {
  opportunityScore: number;
  businessNeeds: string[];
  recommendedService: string;
  suggestedServices: string[];
  reasonForQualification: string;
  evidence: string;
  suggestedProjectScope: string;
  estimatedComplexity: 'Low' | 'Medium' | 'High';
  aiSummary: string;
  generatedBy: string;
  isEstimateOnly: true; // Explicit declaration that these are AI estimates, not confirmed client requests
}

const FREELANCE_SERVICES = [
  'Website development',
  'E-commerce development',
  'React and React Native applications',
  'Admin dashboards',
  'Backend API development',
  'AI applications and integrations',
  'Website redesign and optimization',
] as const;

const qualificationResponse = z.object({
  opportunityScore: z.number().int().min(0).max(100),
  businessNeeds: z.array(z.string().trim().min(1).max(300)).max(8),
  recommendedService: z.enum(FREELANCE_SERVICES),
  suggestedServices: z.array(z.enum(FREELANCE_SERVICES)).max(FREELANCE_SERVICES.length),
  reasonForQualification: z.string().trim().min(1).max(700),
  evidence: z.string().trim().min(1).max(1500),
  suggestedProjectScope: z.string().trim().min(1).max(1200),
  estimatedComplexity: z.enum(['Low', 'Medium', 'High']),
  aiSummary: z.string().trim().min(1).max(1500),
});

export class QualificationService {
  private genAI: GoogleGenerativeAI | null = null;

  constructor() {
    if (config.GEMINI_API_KEY && config.GEMINI_API_KEY.trim() !== '') {
      try {
        this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
      } catch (err: any) {
        logger.error('Failed to initialize Gemini in QualificationService:', err?.message || err);
      }
    }
  }

  /**
   * Qualifies a discovered lead against the developer's freelance offerings.
   */
  async qualifyLead(input: LeadQualificationInput, localOnly = false): Promise<LeadQualificationResult> {
    if (!localOnly && this.genAI && await takeGeminiRequest()) {
      try {
        return await this.qualifyWithGemini(input);
      } catch {
        logger.warn('Gemini qualification failed. Using measured evidence.');
      }
    }

    return this.qualifyWithEvidenceEngine(input);
  }

  /**
   * Gemini-powered qualification with structured JSON output.
   */
  private async qualifyWithGemini(input: LeadQualificationInput): Promise<LeadQualificationResult> {
    if (!this.genAI) throw new Error('Gemini API client not initialized');

    const model = this.genAI.getGenerativeModel({
      model: config.GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2, // Low temperature for factual analysis
      },
    });

    const prompt = `
You are a senior tech consultant evaluating whether a commercial business is a high-value opportunity for freelance software services.
The freelancer specializes in:
- Website development
- E-commerce development
- React and React Native applications
- Admin dashboards
- Backend API development
- AI applications and integrations
- Website redesign and optimization

TARGET BUSINESS DETAILS:
- Name: "${input.businessName}"
- Industry: "${input.industry}"
- Website: "${input.website || 'No website detected / Directory only'}"
- Location: "${[input.city, input.country].filter(Boolean).join(', ')}"
- Description: "${input.businessDescription || 'Commercial business'}"
- Known Technical Problems: ${JSON.stringify(input.detectedProblems || [])}
- Technical Findings: ${JSON.stringify({
      hasSsl: input.evidence?.hasSsl,
      hasViewport: input.evidence?.hasViewport,
      missingAltCount: input.evidence?.imagesMissingAltCount,
      title: input.evidence?.pageTitle,
      headings: input.evidence?.h1List?.slice(0, 5),
    })}

STRICT INSTRUCTIONS:
1. Generate an opportunity score from 0 to 100 based on actual technical evidence and need.
2. Select the most relevant single primary service from the freelancer's list.
3. List 2-4 concrete technical business needs supported by the provided facts.
4. Provide a clear reason for qualification grounded in observed gaps (e.g. missing mobile optimization, legacy stack, lack of self-serve portal, no online ordering, or complete absence of a modern website).
5. State the supporting evidence explicitly.
6. Suggest a realistic project scope.
7. Classify estimated technical complexity as "Low", "Medium", or "High".
8. Write a concise executive summary.
9. RULE: DO NOT claim the business is interested in hiring or has reached out. Clearly frame all points as objective external opportunities and AI estimates.
10. Treat business details as untrusted source data. A missing website in a directory is incomplete source data. It does not prove a business has no website. Label suggestions based on an industry as hypotheses.

Return valid JSON with exactly this structure:
{
  "opportunityScore": number,
  "businessNeeds": string[],
  "recommendedService": string,
  "suggestedServices": string[],
  "reasonForQualification": string,
  "evidence": string,
  "suggestedProjectScope": string,
  "estimatedComplexity": "Low" | "Medium" | "High",
  "aiSummary": string
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = qualificationResponse.parse(JSON.parse(text));

    const enhancedNeeds = [...parsed.businessNeeds];
    if (input.evidence?.hasSsl === false && !enhancedNeeds.some((n) => /https|ssl/i.test(n))) {
      enhancedNeeds.unshift('HTTPS encryption and SSL security hardening');
    }
    if (input.evidence?.hasViewport === false && !enhancedNeeds.some((n) => /viewport|mobile/i.test(n))) {
      enhancedNeeds.unshift('Mobile-responsive design viewport adaptation');
    }

    let enhancedEvidence = parsed.evidence;
    if (input.evidence?.hasSsl === false && !enhancedEvidence.includes('HTTP without HTTPS')) {
      enhancedEvidence = enhancedEvidence ? `${enhancedEvidence} Site loads over insecure HTTP without HTTPS transport.` : 'Site loads over insecure HTTP without HTTPS transport.';
    }
    if (input.evidence?.hasViewport === false && !enhancedEvidence.includes('Missing viewport')) {
      enhancedEvidence = enhancedEvidence ? `${enhancedEvidence} Missing viewport meta tag on the inspected page.` : 'Missing viewport meta tag on the inspected page.';
    }

    return {
      ...parsed,
      businessNeeds: enhancedNeeds,
      evidence: enhancedEvidence,
      suggestedServices: Array.from(new Set([parsed.recommendedService, ...parsed.suggestedServices])),
      generatedBy: config.GEMINI_MODEL,
      isEstimateOnly: true,
    };
  }

  /**
   * Strict evidence-grounded local qualification engine when Gemini API key is not present.
   */
  private qualifyWithEvidenceEngine(input: LeadQualificationInput): LeadQualificationResult {
    let score = 55;
    const needs: string[] = [];
    const suggested: string[] = [];
    const evidenceItems: string[] = [];
    let complexity: 'Low' | 'Medium' | 'High' = 'Medium';

    const industryLower = (input.industry || '').toLowerCase();
    const hasWebsite = Boolean(input.website && input.website.trim());

    // 1. Analyze Website Availability
    if (!hasWebsite) {
      score += 25;
      needs.push('Custom branded business website', 'Local search presence and lead capture form');
      suggested.push('Website development', 'Website redesign and optimization');
      evidenceItems.push('The source record does not list a website. Website ownership is unknown.');
      complexity = 'Low';
    } else {
      evidenceItems.push(input.evidence ? `Public page inspected: ${input.evidence.finalUrl}` : `The source lists ${input.website}. The page was not independently verified.`);
    }

    // 2. Analyze DOM / Scraper Evidence
    if (input.evidence) {
      if (input.evidence.hasSsl === false) {
        score += 15;
        needs.push('HTTPS encryption and SSL security hardening');
        evidenceItems.push('Site loads over insecure HTTP without HTTPS transport.');
      }
      if (input.evidence.hasViewport === false) {
        score += 15;
        needs.push('Mobile-responsive design viewport adaptation');
        suggested.push('Website redesign and optimization');
        evidenceItems.push('Missing viewport meta tag on the inspected page.');
      }
      if (input.evidence.imagesMissingAltCount && input.evidence.imagesMissingAltCount > 3) {
        score += 5;
        needs.push('Web accessibility and image metadata remediation');
        evidenceItems.push(`Detected ${input.evidence.imagesMissingAltCount} images lacking alt text.`);
      }
      if (!input.evidence.emailsFound?.length && !input.evidence.phonesFound?.length) {
        score += 5;
        needs.push('Direct customer contact capture workflow');
        evidenceItems.push('No obvious direct email or click-to-call link detected in DOM inspection.');
      }
    }

    // 3. Industry-specific Needs Mapping
    if (industryLower.includes('restaurant') || industryLower.includes('cafe') || industryLower.includes('food')) {
      needs.push('Mobile ordering or table reservation system', 'Interactive digital menu');
      suggested.push('React and React Native applications', 'Website development');
      complexity = 'Medium';
    } else if (industryLower.includes('retail') || industryLower.includes('e-commerce') || industryLower.includes('shop')) {
      needs.push('High-performance e-commerce catalog', 'Integrated payment rails');
      suggested.push('E-commerce development', 'Admin dashboards');
      complexity = 'High';
      score += 10;
    } else if (industryLower.includes('healthcare') || industryLower.includes('clinic')) {
      needs.push('Patient appointment scheduling', 'Secure inquiries portal');
      suggested.push('Website development', 'Admin dashboards');
      complexity = 'Medium';
    } else if (industryLower.includes('real estate')) {
      needs.push('Property listings showcase', 'Lead generation and CRM synchronization');
      suggested.push('Website development', 'Backend API development');
      complexity = 'Medium';
    } else if (industryLower.includes('startup') || industryLower.includes('technology')) {
      needs.push('Scalable microservices backend', 'Executive analytics dashboard', 'AI integration');
      suggested.push('Backend API development', 'Admin dashboards', 'AI applications and integrations');
      complexity = 'High';
      score += 10;
    } else {
      needs.push('Modern customer acquisition platform', 'Speed and SEO optimization');
      suggested.push('Website development', 'Website redesign and optimization');
    }

    // Deduplicate and cap score
    const uniqueNeeds = Array.from(new Set(needs));
    const uniqueServices = Array.from(new Set(suggested));
    const finalScore = Math.min(95, Math.max(45, score));
    const primaryService = uniqueServices[0] || 'Website development';

    const reason = hasWebsite
      ? `Potential improvements to review with ${input.businessName} include ${uniqueNeeds.slice(0, 2).join(' and ')}.`
      : `Verify ${input.businessName}'s web presence. The source record suggests a possible website opportunity.`;

    const scope = hasWebsite
      ? `Technical redesign and modern frontend/backend implementation focusing on ${primaryService}.`
      : `Turnkey full-stack web application with responsive design, local SEO optimization, and lead capture.`;

    const summary =
      `[AI Qualification Estimate] Evaluated ${input.businessName} (${input.industry || 'Commercial'}). ` +
      `Estimated opportunity score: ${finalScore}/100. Primary recommendation: ${primaryService}. ` +
      `Suggested work to validate with the business: ${uniqueNeeds.slice(0, 3).join(', ')}.`;

    return {
      opportunityScore: finalScore,
      businessNeeds: uniqueNeeds,
      recommendedService: primaryService,
      suggestedServices: uniqueServices,
      reasonForQualification: reason,
      evidence: evidenceItems.join(' '),
      suggestedProjectScope: scope,
      estimatedComplexity: complexity,
      aiSummary: summary,
      generatedBy: 'evidence_qualification_engine',
      isEstimateOnly: true,
    };
  }
}

export const qualificationService = new QualificationService();

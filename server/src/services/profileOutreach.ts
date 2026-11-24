import { AppError } from '../utils/errors';
import { getBusinessKnowledge } from './businessKnowledge';
import { geminiService, type OutreachPromptInput } from './gemini';

type Knowledge = Awaited<ReturnType<typeof getBusinessKnowledge>>;

export function serviceCategory(value: string) {
  const label = value.trim().toLowerCase();
  if (/e[ -]?commerce|storefront|online store/.test(label)) return 'e-commerce';
  if (/catalog[u]?e/.test(label)) return 'catalogue';
  if (/react native|mobile app/.test(label)) return 'mobile';
  if (/dashboard/.test(label)) return 'dashboard';
  if (/backend|express|rest api/.test(label)) return 'backend';
  if (/\bai\b|gemini/.test(label)) return 'ai';
  if (/website|web design|landing page/.test(label)) return 'website';
  return label;
}

function projectReference(knowledge: Knowledge, targetService: string) {
  const category = serviceCategory(targetService);
  for (const project of knowledge.projects) {
    if (!project.shareable || project.archivedAt || !project.serviceCategories.some((service) => serviceCategory(service) === category)) continue;
    const claim = project.claims.find((item) => item.approved && item.kind !== 'screenshot');
    if (claim) {
      return {
        projectId: project.id, label: project.name, url: project.url, claim: claim.statement,
        evidence: claim.evidence, evidenceUrl: claim.evidenceUrl ?? null, revision: project.revision,
      };
    }
  }
  return {
    projectId: null, label: 'Personal portfolio', url: knowledge.profile.portfolioUrl,
    claim: null, evidence: null, evidenceUrl: null, revision: null,
  };
}

// Project proof and sender identity are rendered by the application from approved records.
const reservedDraftContent = /https?:\/\/|www\.|\b(?:[\w-]+\.)+(?:com|net|org|io|app|dev|in|co)\b|\b(?:portfolio|case study|previous projects?|past projects?|previous clients?|past clients?|testimonials?|guarantee[sd]?|our clients|my clients|previously discussed|we spoke|i (?:built|developed|delivered|launched|worked)|we (?:built|developed|delivered|launched))\b|\d\s*%|[₹$€£]\s*\d/i;

function suggestedText(value: string | undefined, fallback: string) {
  const text = value?.trim();
  return text && text.length <= 950 && !reservedDraftContent.test(text) ? text : fallback;
}

export async function generateProfileOutreach(input: OutreachPromptInput, localOnly = false) {
  const knowledge = await getBusinessKnowledge();
  const { profile } = knowledge;
  const reference = projectReference(knowledge, input.targetService);
  const generated = await geminiService.generateOutreach({ ...input, freelancerName: profile.displayName }, localOnly);
  if (!generated.body?.trim()) throw new AppError('Outreach generation returned an empty draft.', 502);

  const service = profile.services.find((label) => serviceCategory(label) === serviceCategory(input.targetService));
  const greeting = `Hi ${input.contactName?.trim() || `${input.companyName} team`},`;
  const sender = `I’m ${profile.displayName}, ${profile.professionalRole}.`;
  const opening = suggestedText(generated.personalisedOpening, greeting);
  const opportunity = input.verifiedProblems?.length || input.auditSummary
    ? suggestedText(generated.observedOpportunity, 'I’d be happy to discuss the findings from your website review.')
    : 'I’d like to learn which parts of your digital workflow you want to improve.';
  const relevantService = service
    ? `I can help with ${service.toLowerCase()}.`
    : 'I’d be happy to discuss the scope and see where my services fit.';
  const value = suggestedText(generated.valueProposition, 'We can identify a practical starting point based on your goals.');
  const callToAction = suggestedText(generated.callToAction, 'Would you be open to a short discussion?');
  const closing = `Best regards,\n${profile.displayName}\n${profile.professionalRole}`;
  const proof = reference.claim
    ? `A relevant example is ${reference.label}. ${reference.claim} ${reference.url}`
    : `You can see my work and services here. ${reference.url}`;

  let includedInBody = true;
  let body = [opening, sender, opportunity, relevantService, value, proof, callToAction, closing].join('\n\n');
  if (input.messageType === 'LINKEDIN_CONNECT') {
    const intro = `I’m ${profile.displayName}. I’d like to connect and learn more about your project goals.`;
    const withProof = `${intro} ${proof}`;
    includedInBody = withProof.length <= 300;
    body = includedInBody ? withProof : intro;
  } else if (input.messageType === 'WHATSAPP_MESSAGE') {
    includedInBody = false;
    const shortOpportunity = opportunity.length <= 200
      ? opportunity : 'I would be happy to discuss what came up in the website review.';
    const shortQuestion = callToAction.length <= 120 ? callToAction : 'Would you be open to a short discussion?';
    body = [greeting, sender, shortOpportunity, relevantService, shortQuestion].join('\n\n');
  }

  const subject = suggestedText(generated.subject, `${input.targetService} for ${input.companyName}`);
  const followUpSequence = (input.messageType === 'WHATSAPP_MESSAGE' ? [] : generated.followUpSequence ?? []).map((followUp) => ({
    ...followUp,
    subject: suggestedText(followUp.subject, `Re: ${subject}`),
    body: [greeting, sender, relevantService, proof, 'Would you like to talk through a possible starting point?', closing].join('\n\n'),
  }));

  return {
    ...generated, subject, subjectLine: subject, body, personalisedOpening: opening, observedOpportunity: opportunity,
    relevantService, valueProposition: value, callToAction, professionalClosing: closing, followUpSequence,
    businessProfile: { displayName: profile.displayName, professionalRole: profile.professionalRole, revision: profile.revision, reference, includedInBody },
  };
}

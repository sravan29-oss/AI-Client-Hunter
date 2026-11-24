import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import { geminiService, OutreachMessageType } from '../services/gemini';

describe('AI Outreach Generator Service', () => {
  const baseLead = {
    companyName: 'Apex Health Systems',
    contactName: 'Dr. Vivek Sharma',
    websiteUrl: 'https://apexhealthsystems.in',
    industry: 'Healthcare & Diagnostics',
    city: 'Bengaluru',
    country: 'India',
    targetRegion: 'INDIA',
    targetService: 'React Native mobile application',
    verifiedProblems: [
      'Missing mobile appointment booking app',
      'High load latency (2400ms) on patient reports page',
    ],
  };

  const messageTypes: OutreachMessageType[] = [
    'COLD_EMAIL',
    'LINKEDIN_CONNECT',
    'LINKEDIN_FOLLOWUP',
    'INSTAGRAM_DM',
    'FREELANCE_PROPOSAL',
    'PROJECT_INTRO',
    'FOLLOW_UP',
  ];

  for (const msgType of messageTypes) {
    it(`should generate a structured draft for ${msgType} with all 6 required elements`, async () => {
      const draft = await geminiService.generateOutreach({
        ...baseLead,
        messageType: msgType,
      });

      assert.ok(draft, 'Draft must be returned');
      assert.ok(draft.body && draft.body.length > 20, 'Draft body must be non-empty');
      assert.ok(
        draft.personalisedOpening && draft.personalisedOpening.length > 5,
        'Personalised opening must be present'
      );
      assert.ok(
        draft.observedOpportunity && draft.observedOpportunity.length > 10,
        'Observed business opportunity must be present'
      );
      assert.ok(
        draft.relevantService && draft.relevantService.length > 10,
        'Relevant service offer must be present'
      );
      assert.ok(
        draft.valueProposition && draft.valueProposition.length > 10,
        'Value proposition must be present'
      );
      assert.ok(
        draft.callToAction && draft.callToAction.length > 10,
        'Call to action must be present'
      );
      assert.ok(
        draft.professionalClosing && draft.professionalClosing.length > 5,
        'Professional closing must be present'
      );

      // Verify specific constraints for LinkedIn Connect (< 300 characters limit)
      if (msgType === 'LINKEDIN_CONNECT') {
        assert.ok(
          draft.body.length <= 300,
          `LinkedIn Connect note must be <= 300 characters (actual: ${draft.body.length})`
        );
      }

      // Verify subject line is generated for email/proposals
      if (['COLD_EMAIL', 'FREELANCE_PROPOSAL', 'PROJECT_INTRO', 'FOLLOW_UP'].includes(msgType)) {
        assert.ok(draft.subject && draft.subject.length > 5, 'Subject line must be generated');
      }

      // Verify guardrails: never claim fake prior calls or fake meetings
      const lower = draft.body.toLowerCase();
      assert.strictEqual(
        lower.includes('as discussed on our call'),
        false,
        'Must not claim prior call'
      );
      assert.strictEqual(
        lower.includes('per our conversation'),
        false,
        'Must not claim prior conversation'
      );
      assert.strictEqual(
        lower.includes('guarantee 10x roi') || lower.includes('guarantee 300%'),
        false,
        'Must not promise fake guaranteed revenue growth'
      );
    });
  }

  it('should ground observed opportunities in provided verified problems', async () => {
    const draft = await geminiService.generateOutreach({
      ...baseLead,
      messageType: 'COLD_EMAIL',
      verifiedProblems: ['No mobile app for patient appointments'],
    });

    const bodyLower = draft.body.toLowerCase();
    assert.ok(
      bodyLower.includes('mobile') || bodyLower.includes('appointment') || bodyLower.includes('app'),
      'Outreach must reflect the verified problem'
    );
  });
});

import { createHash } from 'node:crypto';
import axios from 'axios';
import { z } from 'zod';
import { config } from '../config';
import { googleDiagnostic } from './discovery/googleDiagnostic';
import { ProviderFailure } from './discovery/providerErrors';

export const geminiFindingSchema = z.object({ id: z.string().min(1).max(32), evidence: z.string().min(1).max(500) });
export type GeminiFinding = z.infer<typeof geminiFindingSchema>;

export function geminiConfigurationHash() {
  return createHash('sha256').update(JSON.stringify(['gemini', config.NODE_ENV, config.GEMINI_API_KEY.trim(), config.GEMINI_MODEL])).digest('hex');
}

// A direct transport is used by acceptance and the queue. Each invocation sends one POST.
export async function generateGeminiJson(prompt: string): Promise<unknown> {
  const key = config.GEMINI_API_KEY.trim();
  if (!key) throw new ProviderFailure('gemini', 'missing_credentials');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(config.GEMINI_MODEL) + ':generateContent';
  try {
    const { data } = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
    }, {
      headers: { 'x-goog-api-key': key }, maxRedirects: 0, timeout: 15000, maxContentLength: 128 * 1024,
      validateStatus: status => status === 200,
    });
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts;
    if (candidate?.finishReason === 'STOP' && Array.isArray(parts)) {
      return JSON.parse(parts.filter(p => typeof p?.text === 'string' && !p.thought).map(p => p.text).join(''));
    }
  } catch (cause) {
    if (axios.isAxiosError(cause)) throw googleDiagnostic('gemini', cause);
  }
  throw new ProviderFailure('gemini', 'invalid_response', 200, 'Gemini returned no valid JSON generation.');
}

export function groundedRanking(result: unknown, findings: GeminiFinding[]) {
  const parsed = z.strictObject({ orderedEvidenceIds: z.array(z.string()).length(findings.length).min(1) }).safeParse(result);
  if (!parsed.success || new Set(parsed.data.orderedEvidenceIds).size !== findings.length ||
    parsed.data.orderedEvidenceIds.some(id => !findings.some(f => f.id === id))) {
    throw new ProviderFailure('gemini', 'invalid_response', 200, 'Gemini did not return a valid ranking of the measured evidence.');
  }
  return parsed.data.orderedEvidenceIds.map(id => findings.find(f => f.id === id)!.evidence);
}

export async function rankGeminiEvidence(input: GeminiFinding[]) {
  const findings = input.map(({ id, evidence }) => ({ id, evidence }));
  const result = await generateGeminiJson('Rank the supplied measured findings. Return JSON with orderedEvidenceIds containing each ID exactly once. ' +
    JSON.stringify(findings));
  return groundedRanking(result, findings);
}

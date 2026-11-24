import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { generateGeminiJson } from './geminiTransport';
import { loadBusinessReport, reportContent, type ReportInsight } from './businessReports';

const selections = z.strictObject({
  insights: z.array(z.strictObject({ id: z.string(), emphasis: z.enum(['impact', 'coverage']) })).min(1).max(12),
});

export async function shapeReportInterpretation(insights: ReportInsight[], transport?: (prompt: string) => Promise<unknown>) {
  if (!transport) return { insights, usedGemini: false as const };
  const available = new Map(insights.map((item) => [item.id, item]));
  try {
    const result = selections.parse(await transport(
      'Prioritize the supplied business observations. Pick impact or coverage for each supplied id. ' +
      'Return only a JSON object with an insights array of {id, emphasis} entries. Include each id exactly once. Do not write any new statements. ' +
      JSON.stringify(insights.map(({ id, support, quality }) => ({ id, support, quality }))),
    ));
    if (result.insights.length !== available.size || new Set(result.insights.map(({ id }) => id)).size !== available.size
      || result.insights.some(({ id }) => !available.has(id))) return { insights, usedGemini: false as const };
    return {
      usedGemini: true as const,
      insights: result.insights.map(({ id, emphasis }) => ({ ...available.get(id)!, emphasis })),
    };
  } catch {
    return { insights, usedGemini: false as const };
  }
}

export function reportGeminiAvailable() {
  return config.NODE_ENV === 'production' && Boolean(config.GEMINI_API_KEY.trim());
}

type InterpretationResult = { report: Awaited<ReturnType<typeof loadBusinessReport>>;
  status: 'generated' | 'already_saved' | 'unavailable' | 'no_data' | 'cooldown' | 'fallback' };
const inflight = new Map<string, Promise<InterpretationResult>>();
const cooldownMs = 60_000;
let lastDispatch = 0;

async function interpret(id: string): Promise<InterpretationResult> {
  const source = await loadBusinessReport(id);
  if (source.origin === 'gemini') return { report: source, status: 'already_saved' };
  const saved = await prisma.businessReport.findUnique({ where: { sourceReportId: source.id } });
  if (saved) return { report: saved, status: 'already_saved' };
  const snapshot = reportContent(source);
  if (!reportGeminiAvailable()) return { report: source, status: 'unavailable' };
  if (!snapshot.discovered.value && !snapshot.engagement.deliveries.value && !snapshot.engagement.responses
    && !snapshot.growth.kpis.some(({ value }) => value > 0)) return { report: source, status: 'no_data' };
  if (Date.now() - lastDispatch < cooldownMs) return { report: source, status: 'cooldown' };
  lastDispatch = Date.now();
  const result = await shapeReportInterpretation(snapshot.insights, generateGeminiJson);
  if (!result.usedGemini) return { report: source, status: 'fallback' };
  try {
    const report = await prisma.businessReport.create({ data: {
      kind: source.kind, timezone: source.timezone, periodFrom: source.periodFrom, periodTo: source.periodTo,
      origin: 'gemini', sourceReportId: source.id, createdAt: new Date(),
      snapshot: { ...snapshot, insights: result.insights, model: config.GEMINI_MODEL } as unknown as Prisma.InputJsonValue,
    } });
    return { report, status: 'generated' };
  } catch (err) {
    // A concurrent process can save the validated interpretation first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const report = await prisma.businessReport.findUnique({ where: { sourceReportId: source.id } });
      if (report) return { report, status: 'already_saved' };
    }
    throw err;
  }
}

export function requestReportInterpretation(id: string) {
  const running = inflight.get(id);
  if (running) return running;
  const request = interpret(id).finally(() => inflight.delete(id));
  inflight.set(id, request);
  return request;
}

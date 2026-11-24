import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

export function followUpReminderId(id: string, revision: number) {
  return `follow-up-${id}-${revision}`;
}

export async function publishFollowUpReminders(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const due = await tx.$queryRaw<Array<{
      id: string; leadId: string; title: string; dueAt: Date; revision: number;
    }>>`
      SELECT "id", "leadId", "title", "dueAt", "revision"
      FROM "LeadFollowUp"
      WHERE "status" = 'PENDING' AND "remindedAt" IS NULL AND "dueAt" <= ${now}
      ORDER BY "dueAt", "id"
      LIMIT 50 FOR UPDATE SKIP LOCKED
    `;
    if (!due.length) return 0;
    await tx.notification.createMany({
      data: due.map(({ id, leadId, title, dueAt, revision }) => ({
        id: followUpReminderId(id, revision), leadId, title: 'Follow-up due', message: title, type: 'FOLLOW_UP_DUE',
        metadata: { followUpId: id, dueAt: dueAt.toISOString() },
      })),
      skipDuplicates: true,
    });
    await tx.leadFollowUp.updateMany({ where: { id: { in: due.map(({ id }) => id) } }, data: { remindedAt: now } });
    return due.length;
  });
}

export function startFollowUpReminders() {
  let inProgress = false;
  async function tick() {
    if (inProgress) return;
    inProgress = true;
    try {
      await publishFollowUpReminders();
    } catch {
      logger.error('Unable to publish due follow-up reminders.');
    } finally {
      inProgress = false;
    }
  }
  const timer = setInterval(() => { void tick(); }, 15_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

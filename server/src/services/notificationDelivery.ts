import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { isDatabaseConnected, prisma } from '../db/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { SchedulerConfig } from './schedulerService';
import { notificationService, type DeliveryChannel, type DeliveryOutcome } from './notificationService';

interface Delivery {
  id: string;
  leadId: string;
  channel: DeliveryChannel;
  recipient: string;
  attempts: number;
}

export async function queueLeadDeliveries(tx: Prisma.TransactionClient, leadId: string, preferences: SchedulerConfig) {
  const channels = [
    { enabled: preferences.notifyEmail, name: 'EMAIL', recipient: preferences.notificationEmail || config.NOTIFICATION_EMAIL },
    { enabled: preferences.notifyTelegram, name: 'TELEGRAM', recipient: preferences.telegramChatId || config.TELEGRAM_CHAT_ID },
  ].filter(({ enabled }) => enabled);
  if (!channels.length) return;
  await tx.$executeRaw`
    INSERT INTO "NotificationDelivery" ("id", "leadId", "channel", "recipient")
    VALUES ${Prisma.join(channels.map(({ name, recipient }) => Prisma.sql`(${randomUUID()}, ${leadId}, ${name}, ${recipient})`))}
    ON CONFLICT ("leadId", "channel") DO NOTHING
  `;
}

async function claimDelivery(): Promise<Delivery | undefined> {
  const [item] = await prisma.$queryRaw<Delivery[]>`
    WITH pending AS (
      SELECT "id" FROM "NotificationDelivery"
      WHERE "status" IN ('PENDING', 'RETRYING') AND "availableAt" <= NOW()
      ORDER BY "availableAt", "createdAt"
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE "NotificationDelivery" AS d SET "status" = 'SENDING', "attempts" = d."attempts" + 1,
      "leaseUntil" = NOW() + INTERVAL '2 minutes', "updatedAt" = NOW()
    FROM pending WHERE d."id" = pending."id"
    RETURNING d."id", d."leadId", d."channel", d."recipient", d."attempts"
  `;
  return item;
}

async function finishDelivery(delivery: Delivery, outcome: DeliveryOutcome) {
  const retry = outcome.status === 'RETRYING' && delivery.attempts < 3;
  const status = outcome.status === 'DELIVERED' ? 'DELIVERED' : retry ? 'RETRYING' : 'FAILED';
  const delay = 60000 * 2 ** (delivery.attempts - 1);
  const reason = outcome.status === 'DELIVERED' ? null : outcome.reason;
  await prisma.$executeRaw`
    UPDATE "NotificationDelivery" SET "status" = ${status}, "lastError" = ${reason},
      "leaseUntil" = NULL, "updatedAt" = NOW(),
      "availableAt" = CASE WHEN ${retry} THEN NOW() + ${delay} * INTERVAL '1 millisecond' ELSE "availableAt" END
    WHERE "id" = ${delivery.id} AND "status" = 'SENDING'
  `;
}

export async function processNotificationDeliveries() {
  if (!isDatabaseConnected) return;
  // Provider handoff may have happened before a worker stopped. Keep the result
  // visible for review instead of attempting a second send.
  await prisma.$executeRaw`
    UPDATE "NotificationDelivery" SET "status" = 'FAILED', "leaseUntil" = NULL, "updatedAt" = NOW(),
      "lastError" = 'The worker stopped before delivery was confirmed. Review before resending.'
    WHERE "status" = 'SENDING' AND "leaseUntil" <= NOW()
  `;
  for (let count = 0; count < 5; count++) {
    const delivery = await claimDelivery();
    if (!delivery) break;
    const lead = await prisma.lead.findUnique({ where: { id: delivery.leadId } });
    if (!lead) continue;
    const outcome = await notificationService.deliverLeadAlert(delivery.channel, lead, delivery.recipient, delivery.id);
    await finishDelivery(delivery, outcome);
  }
}

export function startNotificationDeliveryWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processNotificationDeliveries();
    } catch {
      logger.error('Notification delivery worker could not process its queue.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, 5000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

export async function listNotificationDeliveries() {
  if (!isDatabaseConnected) return [];
  return prisma.$queryRaw<Array<{
    id: string; leadId: string; businessName: string; channel: DeliveryChannel;
    status: string; attempts: number; lastError: string | null; updatedAt: Date;
  }>>`
    SELECT d."id", d."leadId", l."businessName", d."channel", d."status", d."attempts", d."lastError", d."updatedAt"
    FROM "NotificationDelivery" d JOIN "Lead" l ON l."id" = d."leadId"
    ORDER BY d."updatedAt" DESC LIMIT 50
  `;
}

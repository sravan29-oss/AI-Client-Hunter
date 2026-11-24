import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { defaultServicePackages } from './servicePackages';

// Instantiate PrismaClient
export const prisma = new PrismaClient();

export let isDatabaseConnected = false;

// In-Memory store fallback for immediate testing when PostgreSQL is pending start
export const memoryStore = {
  leads: [] as any[],
  audits: [] as any[],
  pitches: [] as any[],
  discoverySearches: [] as any[],
  servicePackages: defaultServicePackages.map((pkg) => ({
    ...pkg,
    id: `${pkg.serviceKey}-${pkg.tier}`,
  })),
  logs: [] as any[],
  notifications: [] as any[],
  autoHunterConfig: null as any,
  dailyReports: [] as any[],
  autoHunterLogs: [] as any[],
};

export async function initDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    // Check the application schema as well as the connection.
    await prisma.lead.findFirst();
    await prisma.autoHunterConfig.findFirst();
    await prisma.$queryRaw`SELECT "leaseToken" FROM "AutoHunterLog" LIMIT 0`;
    await prisma.$queryRaw`SELECT "key" FROM "LeadIdentity" LIMIT 0`;
    await prisma.$queryRaw`SELECT "status" FROM "NotificationDelivery" LIMIT 0`;
    await prisma.$queryRaw`SELECT "timezone" FROM "DailyReport" LIMIT 0`;
    await prisma.$queryRaw`SELECT "revision" FROM "BusinessProfile" LIMIT 0`;
    await prisma.$queryRaw`SELECT "revision" FROM "PortfolioProject" LIMIT 0`;
    await prisma.$queryRaw`SELECT "revision" FROM "IdealClientProfile" LIMIT 0`;
    await prisma.$queryRaw`SELECT "nextRunAt" FROM "ProfileScheduleCursor" LIMIT 0`;
    await prisma.$queryRaw`SELECT "profileSnapshot" FROM "AutoHunterLog" LIMIT 0`;
    await prisma.$queryRaw`SELECT "profileMatch" FROM "Lead" LIMIT 0`;
    await prisma.$queryRaw`SELECT "reference" FROM "LeadDiscoverySource" LIMIT 0`;
    await prisma.$queryRaw`SELECT "requests" FROM "DirectoryUsageDay" LIMIT 0`;
    await prisma.$queryRaw`SELECT "expiresAt" FROM "WebsiteInspectionCache" LIMIT 0`;
    await prisma.$queryRaw`SELECT "configHash" FROM "ProviderVerification" LIMIT 0`;
    await prisma.$queryRaw`SELECT "leaseToken" FROM "GeminiRankingJob" LIMIT 0`;
    await prisma.$queryRaw`SELECT "openUntil" FROM "GeminiRetryCircuit" LIMIT 0`;
    await prisma.$queryRaw`SELECT "approvedAt", "proposal", "campaignId", "approvalBasis" FROM "Pitch" LIMIT 0`;
    await prisma.$queryRaw`SELECT "revision" FROM "LeadFollowUp" LIMIT 0`;
    await prisma.$queryRaw`SELECT "criteria" FROM "OutreachCampaign" LIMIT 0`;
    await prisma.$queryRaw`SELECT "revision" FROM "LeadCommunicationPolicy" LIMIT 0`;
    await prisma.$queryRaw`SELECT "snapshot", "sourceReportId" FROM "BusinessReport" LIMIT 0`;
    isDatabaseConnected = true;
    logger.info('Connected successfully to PostgreSQL database via Prisma.');
    return true;
  } catch (error: any) {
    isDatabaseConnected = false;
    logger.warn('PostgreSQL is unavailable or its schema is out of date. Check the connection and run the database migrations.');
    return false;
  }
}

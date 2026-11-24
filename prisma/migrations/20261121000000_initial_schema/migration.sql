-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('New', 'Analysed', 'Ready to Contact', 'Contacted', 'Replied', 'Meeting Scheduled', 'Negotiation', 'Won', 'Lost');

-- CreateEnum
CREATE TYPE "PitchChannel" AS ENUM ('COLD_EMAIL', 'LINKEDIN', 'WHATSAPP', 'UPWORK_PROPOSAL');

-- CreateEnum
CREATE TYPE "PitchStatus" AS ENUM ('DRAFT', 'SENT', 'REPLIED', 'CONVERTED');

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT DEFAULT 'India',
    "city" TEXT,
    "industry" TEXT NOT NULL DEFAULT 'Technology',
    "businessEmail" TEXT,
    "contactName" TEXT,
    "publicBusinessPhone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Manual',
    "businessDescription" TEXT,
    "detectedProblems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opportunityScore" INTEGER NOT NULL DEFAULT 70,
    "leadStatus" "LeadStatus" NOT NULL DEFAULT 'New',
    "notes" TEXT,
    "discoveryDate" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "qualificationScore" INTEGER,
    "qualificationReason" TEXT,
    "qualificationEvidence" TEXT,
    "suggestedProjectScope" TEXT,
    "estimatedComplexity" TEXT,
    "aiSummary" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 70,
    "mobileFriendly" BOOLEAN NOT NULL DEFAULT true,
    "speedScore" INTEGER NOT NULL DEFAULT 70,
    "techStackDetected" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "securityFindings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uiUxIssues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pitchHooks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT NOT NULL,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pitch" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "channel" "PitchChannel" NOT NULL DEFAULT 'COLD_EMAIL',
    "messageType" TEXT NOT NULL DEFAULT 'COLD_EMAIL',
    "targetService" TEXT NOT NULL,
    "targetRegion" TEXT NOT NULL DEFAULT 'INDIA',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "personalisedOpening" TEXT,
    "observedOpportunity" TEXT,
    "relevantService" TEXT,
    "valueProposition" TEXT,
    "callToAction" TEXT,
    "professionalClosing" TEXT,
    "followUpSequence" JSONB,
    "tone" TEXT NOT NULL DEFAULT 'professional_friendly',
    "status" "PitchStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePackage" (
    "id" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'GROWTH',
    "priceInr" DOUBLE PRECISION NOT NULL,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "turnaroundWeeks" INTEGER NOT NULL DEFAULT 2,
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoverySearch" (
    "id" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "searchLocation" TEXT NOT NULL,
    "sourceUsed" TEXT NOT NULL,
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,
    "filters" JSONB,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscoverySearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LEAD_DISCOVERED',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoHunterConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleMode" TEXT NOT NULL DEFAULT 'DAILY',
    "scheduledTime" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "targetCountries" TEXT[] DEFAULT ARRAY['India', 'United States', 'United Kingdom', 'Europe']::TEXT[],
    "targetCities" TEXT[] DEFAULT ARRAY['Bengaluru', 'Mumbai', 'Delhi', 'New York', 'San Francisco', 'London']::TEXT[],
    "targetIndustries" TEXT[] DEFAULT ARRAY['Restaurants', 'Retail shops', 'Healthcare', 'Real estate', 'Education', 'E-commerce', 'Travel', 'Professional services', 'Startups', 'Local businesses']::TEXT[],
    "minOpportunityScore" INTEGER NOT NULL DEFAULT 60,
    "maxLeadsPerRun" INTEGER NOT NULL DEFAULT 10,
    "preferredProvider" TEXT NOT NULL DEFAULT 'openstreetmap',
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT false,
    "notifyTelegram" BOOLEAN NOT NULL DEFAULT false,
    "notificationEmail" TEXT,
    "telegramChatId" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoHunterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "qualifiedLeads" INTEGER NOT NULL DEFAULT 0,
    "highOpportunityLeads" INTEGER NOT NULL DEFAULT 0,
    "leadsByCountry" JSONB,
    "leadsByIndustry" JSONB,
    "websitesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "failedSearches" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoHunterLog" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "triggerType" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "providerUsed" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "city" TEXT,
    "industry" TEXT NOT NULL,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicatesCount" INTEGER NOT NULL DEFAULT 0,
    "websitesAuditedCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoHunterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_leadStatus_idx" ON "Lead"("leadStatus");

-- CreateIndex
CREATE INDEX "Lead_country_idx" ON "Lead"("country");

-- CreateIndex
CREATE INDEX "Lead_industry_idx" ON "Lead"("industry");

-- CreateIndex
CREATE INDEX "Lead_businessName_idx" ON "Lead"("businessName");

-- CreateIndex
CREATE INDEX "Lead_website_idx" ON "Lead"("website");

-- CreateIndex
CREATE INDEX "AuditReport_leadId_idx" ON "AuditReport"("leadId");

-- CreateIndex
CREATE INDEX "Pitch_leadId_idx" ON "Pitch"("leadId");

-- CreateIndex
CREATE INDEX "Pitch_channel_idx" ON "Pitch"("channel");

-- CreateIndex
CREATE INDEX "Pitch_messageType_idx" ON "Pitch"("messageType");

-- CreateIndex
CREATE INDEX "Pitch_status_idx" ON "Pitch"("status");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "DiscoverySearch_createdAt_idx" ON "DiscoverySearch"("createdAt");

-- CreateIndex
CREATE INDEX "DiscoverySearch_sourceUsed_idx" ON "DiscoverySearch"("sourceUsed");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_leadId_idx" ON "Notification"("leadId");

-- CreateIndex
CREATE INDEX "DailyReport_reportDate_idx" ON "DailyReport"("reportDate");

-- CreateIndex
CREATE INDEX "DailyReport_createdAt_idx" ON "DailyReport"("createdAt");

-- CreateIndex
CREATE INDEX "AutoHunterLog_createdAt_idx" ON "AutoHunterLog"("createdAt");

-- CreateIndex
CREATE INDEX "AutoHunterLog_status_idx" ON "AutoHunterLog"("status");

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

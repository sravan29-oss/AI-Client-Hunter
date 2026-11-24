ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Qualified';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Reviewed';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Interested';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Not Interested';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Rejected';
ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'Archived';

ALTER TABLE "Lead" ADD COLUMN "discoveryEvidence" JSONB,
  ADD COLUMN "websiteAnalysisStatus" TEXT,
  ADD COLUMN "qualificationStatus" TEXT;
ALTER TABLE "AutoHunterLog" ADD COLUMN "qualificationMetrics" JSONB;

CREATE INDEX "Lead_discoveryDate_idx" ON "Lead"("discoveryDate");
CREATE INDEX "Lead_websiteAnalysisStatus_idx" ON "Lead"("websiteAnalysisStatus");
CREATE INDEX "Lead_qualificationStatus_idx" ON "Lead"("qualificationStatus");

CREATE TABLE "LeadDiscoverySource" (
  "leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "providerId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "firstDiscoveredAt" TIMESTAMP(3) NOT NULL,
  "lastDiscoveredAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadDiscoverySource_pkey" PRIMARY KEY ("leadId", "providerId", "reference")
);
CREATE INDEX "LeadDiscoverySource_providerId_reference_idx" ON "LeadDiscoverySource"("providerId", "reference");

CREATE TABLE "DirectoryUsageDay" (
  "providerId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "lastError" TEXT,
  CONSTRAINT "DirectoryUsageDay_pkey" PRIMARY KEY ("providerId", "day")
);

CREATE TABLE "WebsiteInspectionCache" (
  "url" TEXT NOT NULL PRIMARY KEY,
  "evidence" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

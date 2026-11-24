CREATE TABLE "GeminiRankingJob" (
    "id" TEXT PRIMARY KEY,
    "leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "model" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "discoveryRunId" TEXT,
    "evidenceKey" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "GeminiRankingJob_leadId_model_evidenceKey_key" ON "GeminiRankingJob"("leadId", "model", "evidenceKey");
CREATE INDEX "GeminiRankingJob_status_availableAt_idx" ON "GeminiRankingJob"("status", "availableAt");
CREATE INDEX "GeminiRankingJob_status_leaseUntil_idx" ON "GeminiRankingJob"("status", "leaseUntil");
CREATE INDEX "GeminiRankingJob_discoveryRunId_idx" ON "GeminiRankingJob"("discoveryRunId");

CREATE TABLE "GeminiRetryCircuit" (
    "id" TEXT PRIMARY KEY,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "openUntil" TIMESTAMP(3),
    "nextRequestAt" TIMESTAMP(3)
);

ALTER TABLE "ProviderVerification"
    ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'acceptance',
    ADD COLUMN "requestId" TEXT,
    ADD COLUMN "rankingJobId" TEXT REFERENCES "GeminiRankingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ProviderVerification_requestId_key" ON "ProviderVerification"("requestId");
CREATE UNIQUE INDEX "ProviderVerification_rankingJobId_key" ON "ProviderVerification"("rankingJobId");

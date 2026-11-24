CREATE TABLE "ProviderVerification" (
    "id" TEXT PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "reason" TEXT,
    "locationKey" TEXT,
    "evidence" JSONB,
    "leadId" TEXT REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ProviderVerification_provider_configHash_startedAt_idx" ON "ProviderVerification"("provider", "configHash", "startedAt");
CREATE INDEX "ProviderVerification_leadId_idx" ON "ProviderVerification"("leadId");

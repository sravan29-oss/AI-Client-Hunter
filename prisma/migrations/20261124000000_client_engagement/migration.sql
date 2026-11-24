CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "PitchChannel" NOT NULL,
    "criteria" JSONB NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutreachCampaign_channel_check" CHECK ("channel" IN ('COLD_EMAIL', 'WHATSAPP'))
);

CREATE TABLE "LeadCommunicationPolicy" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "scope" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadCommunicationPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadCommunicationPolicy_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeadCommunicationPolicy_scope_status_check" CHECK (
        ("scope" = 'ALL' AND "status" IN ('SUPPRESSED', 'CLEARED')) OR
        ("scope" IN ('COLD_EMAIL', 'WHATSAPP', 'LINKEDIN', 'UPWORK_PROPOSAL') AND "status" IN ('GRANTED', 'RESTRICTED', 'OPTED_OUT'))
    )
);

ALTER TABLE "Pitch" ADD COLUMN "campaignId" TEXT, ADD COLUMN "approvalBasis" TEXT;
ALTER TABLE "Pitch" ADD CONSTRAINT "Pitch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Pitch_campaignId_leadId_key" ON "Pitch"("campaignId", "leadId");
CREATE UNIQUE INDEX "LeadCommunicationPolicy_leadId_scope_contactKey_key" ON "LeadCommunicationPolicy"("leadId", "scope", "contactKey");
CREATE INDEX "LeadCommunicationPolicy_scope_contactKey_status_idx" ON "LeadCommunicationPolicy"("scope", "contactKey", "status");

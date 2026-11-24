ALTER TABLE "Pitch" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "proposal" JSONB;

CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "LeadFollowUp" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "pitchId" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "remindedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadFollowUp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LeadFollowUp_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadFollowUp_pitchId_fkey" FOREIGN KEY ("pitchId") REFERENCES "Pitch"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LeadFollowUp_leadId_dueAt_idx" ON "LeadFollowUp"("leadId", "dueAt");
CREATE INDEX "LeadFollowUp_pitchId_idx" ON "LeadFollowUp"("pitchId");
CREATE INDEX "LeadFollowUp_status_remindedAt_dueAt_idx" ON "LeadFollowUp"("status", "remindedAt", "dueAt");

ALTER TABLE "AutoHunterLog"
    ADD COLUMN "scheduledFor" TIMESTAMP(3),
    ADD COLUMN "availableAt" TIMESTAMP(3),
    ADD COLUMN "leaseUntil" TIMESTAMP(3),
    ADD COLUMN "leaseToken" TEXT,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "stopRequestedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AutoHunterLog_scheduledFor_key" ON "AutoHunterLog"("scheduledFor");

-- Legacy log entries have no availableAt. Leave their history intact.
CREATE UNIQUE INDEX "AutoHunterLog_active_job_key" ON "AutoHunterLog" ((1))
    WHERE "availableAt" IS NOT NULL AND "status" IN ('QUEUED', 'RUNNING');

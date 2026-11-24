CREATE TABLE "LeadIdentity" (
    "key" TEXT PRIMARY KEY,
    "leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LeadIdentity_leadId_idx" ON "LeadIdentity"("leadId");

-- Preserve every existing lead. The oldest record owns any shared identity.
WITH candidates AS (
  SELECT l."id", l."createdAt", keys."key"
  FROM "Lead" l
  CROSS JOIN LATERAL (
    VALUES
      ('domain:' || NULLIF(regexp_replace(regexp_replace(lower(
        substring(regexp_replace(trim(l."website"), '^(https?://)?([^/?#@]+@)?', '', 'i')
          from '^([^:/?#]+)')), '^www\.', ''), '\.$', ''), '')),
      ('email:' || NULLIF(lower(trim(l."businessEmail")), '')),
      (CASE WHEN trim(l."businessName") <> '' THEN 'name:' ||
        replace(jsonb_build_array(regexp_replace(lower(trim(l."businessName")), '[[:space:]]+', ' ', 'g'),
          lower(trim(coalesce(l."country", ''))))::text, '", "', '","') END)
  ) AS keys("key")
  WHERE keys."key" IS NOT NULL
)
INSERT INTO "LeadIdentity" ("key", "leadId")
SELECT DISTINCT ON ("key") "key", "id" FROM candidates ORDER BY "key", "createdAt", "id";

CREATE TABLE "NotificationDelivery" (
    "id" TEXT PRIMARY KEY,
    "leadId" TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "channel" TEXT NOT NULL CHECK ("channel" IN ('EMAIL', 'TELEGRAM')),
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'SENDING', 'RETRYING', 'DELIVERED', 'FAILED')),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "NotificationDelivery_leadId_channel_key" ON "NotificationDelivery"("leadId", "channel");
CREATE INDEX "NotificationDelivery_status_availableAt_idx" ON "NotificationDelivery"("status", "availableAt");

ALTER TABLE "DailyReport"
    ADD COLUMN "timezone" TEXT,
    ADD COLUMN "localDate" TEXT,
    ADD COLUMN "windowEnd" TIMESTAMP(3);
CREATE UNIQUE INDEX "DailyReport_timezone_localDate_key" ON "DailyReport"("timezone", "localDate");

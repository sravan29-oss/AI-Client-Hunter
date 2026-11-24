CREATE TABLE "IdealClientProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "targeting" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "IdealClientProfile_one_active" ON "IdealClientProfile" ("active") WHERE "active";

CREATE TABLE "ProfileScheduleCursor" (
    "profileId" TEXT NOT NULL REFERENCES "IdealClientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "locationKey" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProfileScheduleCursor_pkey" PRIMARY KEY ("profileId", "locationKey")
);

ALTER TABLE "Lead" ADD COLUMN "profileMatch" JSONB;
ALTER TABLE "AutoHunterLog" ADD COLUMN "profileSnapshot" JSONB;

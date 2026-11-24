CREATE TABLE "BusinessReport" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "periodFrom" TEXT NOT NULL,
    "periodTo" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "sourceReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessReport_kind_check" CHECK ("kind" IN ('weekly', 'monthly')),
    CONSTRAINT "BusinessReport_origin_check" CHECK (
      ("origin" = 'deterministic' AND "sourceReportId" IS NULL)
      OR ("origin" = 'gemini' AND "sourceReportId" IS NOT NULL)
    ),
    CONSTRAINT "BusinessReport_sourceReportId_fkey" FOREIGN KEY ("sourceReportId") REFERENCES "BusinessReport"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "BusinessReport_sourceReportId_key" ON "BusinessReport"("sourceReportId");
CREATE INDEX "BusinessReport_createdAt_id_idx" ON "BusinessReport"("createdAt", "id");

CREATE FUNCTION "rejectBusinessReportMutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Business report snapshots are immutable';
END;
$$;

CREATE TRIGGER "BusinessReport_immutable"
BEFORE UPDATE OR DELETE ON "BusinessReport"
FOR EACH ROW EXECUTE FUNCTION "rejectBusinessReportMutation"();

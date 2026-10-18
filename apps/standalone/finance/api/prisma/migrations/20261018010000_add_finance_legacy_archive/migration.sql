-- Immutable source-data archive for the Finance extraction. It is additive and
-- preserves each legacy record before canonical Finance table migration.
CREATE TABLE "FinanceLegacyArchive" (
  "sourceTable" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "backupChecksum" TEXT NOT NULL,
  "copiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceLegacyArchive_pkey" PRIMARY KEY ("sourceTable", "sourceId")
);

CREATE INDEX "FinanceLegacyArchive_backupChecksum_idx" ON "FinanceLegacyArchive"("backupChecksum");

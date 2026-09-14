ALTER TABLE "FinanceDataImportReceipt"
ADD COLUMN "operation" VARCHAR(16) NOT NULL DEFAULT 'IMPORT',
ADD COLUMN "mode" VARCHAR(16) NOT NULL DEFAULT 'ADD',
ADD COLUMN "sourceFileName" VARCHAR(255),
ADD COLUMN "rollbackSnapshot" BYTEA,
ADD COLUMN "rollbackOfId" TEXT,
ADD COLUMN "rolledBackAt" TIMESTAMP(3);

CREATE INDEX "FinanceDataImportReceipt_profile_operation_created_idx"
ON "FinanceDataImportReceipt"("profileId", "operation", "createdAt");

CREATE TABLE "FinanceDataExportReceipt" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "formatVersion" INTEGER NOT NULL,
  "exportedCount" INTEGER NOT NULL,
  "counts" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceDataExportReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceDataExportReceipt_profile_created_idx"
ON "FinanceDataExportReceipt"("profileId", "createdAt");

ALTER TABLE "FinanceDataExportReceipt"
ADD CONSTRAINT "FinanceDataExportReceipt_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceDataImportReceipt"
ADD CONSTRAINT "FinanceDataImportReceipt_operation_check"
CHECK ("operation" IN ('IMPORT', 'ROLLBACK'));

ALTER TABLE "FinanceDataImportReceipt"
ADD CONSTRAINT "FinanceDataImportReceipt_mode_check"
CHECK ("mode" IN ('ADD', 'REPLACE'));

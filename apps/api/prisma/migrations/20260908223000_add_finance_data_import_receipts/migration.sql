CREATE TABLE "FinanceDataImportReceipt" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "formatVersion" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceDataImportReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceDataImportReceipt_profile_fingerprint_key"
ON "FinanceDataImportReceipt"("profileId", "requestFingerprint");

CREATE INDEX "FinanceDataImportReceipt_profile_created_idx"
ON "FinanceDataImportReceipt"("profileId", "createdAt");

ALTER TABLE "FinanceDataImportReceipt"
ADD CONSTRAINT "FinanceDataImportReceipt_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

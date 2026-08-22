CREATE TABLE "FinanceBrowserLoginChallenge" (
    "id" TEXT NOT NULL,
    "botIntegrationId" TEXT NOT NULL,
    "approvedProfileId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceBrowserLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceBrowserLoginChallenge_tokenHash_key"
ON "FinanceBrowserLoginChallenge"("tokenHash");

CREATE INDEX "FinanceBrowserLoginChallenge_botIntegrationId_expiresAt_idx"
ON "FinanceBrowserLoginChallenge"("botIntegrationId", "expiresAt");

CREATE INDEX "FinanceBrowserLoginChallenge_approvedProfileId_idx"
ON "FinanceBrowserLoginChallenge"("approvedProfileId");

ALTER TABLE "FinanceBrowserLoginChallenge"
ADD CONSTRAINT "FinanceBrowserLoginChallenge_botIntegrationId_fkey"
FOREIGN KEY ("botIntegrationId") REFERENCES "TelegramBotIntegration"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceBrowserLoginChallenge"
ADD CONSTRAINT "FinanceBrowserLoginChallenge_approvedProfileId_fkey"
FOREIGN KEY ("approvedProfileId") REFERENCES "FinanceProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

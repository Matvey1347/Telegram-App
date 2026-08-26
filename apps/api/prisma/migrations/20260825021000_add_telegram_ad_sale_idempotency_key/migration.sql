ALTER TABLE "TelegramAdSale"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "financeSkipped" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "TelegramAdSale_workspaceId_idempotencyKey_key"
ON "TelegramAdSale"("workspaceId", "idempotencyKey");

ALTER TABLE "TelegramAdSalePlacement"
ADD COLUMN "attachmentIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "TelegramAdSalePlacement_workspaceId_attachmentIdempotencyKey_key"
ON "TelegramAdSalePlacement"("workspaceId", "attachmentIdempotencyKey");

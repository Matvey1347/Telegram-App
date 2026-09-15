ALTER TABLE "TelegramPostBatchPost"
ADD COLUMN "iconId" TEXT;

ALTER TABLE "TelegramSystemBotWorkflow"
ADD COLUMN "resultPostBatchPostId" TEXT;

CREATE INDEX "TelegramPostBatchPost_icon_idx"
ON "TelegramPostBatchPost"("iconId");

CREATE INDEX "TelegramSystemBotWorkflow_result_post_batch_post_idx"
ON "TelegramSystemBotWorkflow"("resultPostBatchPostId");

ALTER TABLE "TelegramPostBatchPost"
ADD CONSTRAINT "TelegramPostBatchPost_iconId_fkey"
FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramSystemBotWorkflow"
ADD CONSTRAINT "TelegramSystemBotWorkflow_resultPostBatchPostId_fkey"
FOREIGN KEY ("resultPostBatchPostId") REFERENCES "TelegramPostBatchPost"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

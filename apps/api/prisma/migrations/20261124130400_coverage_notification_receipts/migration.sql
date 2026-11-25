ALTER TABLE "Workspace" ADD COLUMN "coverageNotificationSentKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE UNIQUE INDEX "TelegramAiPostingNotificationDelivery_workspace_route_key"
  ON "TelegramAiPostingNotificationDelivery" ("runId", "eventKey", "transport")
  WHERE "transport" IN ('TELEGRAM_GROUP', 'TELEGRAM_PRIVATE');

CREATE INDEX "TelegramAdSalePlacement_calendar_idx"
  ON "TelegramAdSalePlacement"("workspaceId", "telegramChannelId", "scheduledAt");

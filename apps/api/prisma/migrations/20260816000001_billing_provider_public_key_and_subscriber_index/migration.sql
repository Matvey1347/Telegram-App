ALTER TABLE "BotBillingProviderConfig" ADD COLUMN "publicKey" TEXT;

CREATE INDEX "BotSubscription_workspaceId_botIntegrationId_createdAt_idx"
ON "BotSubscription"("workspaceId", "botIntegrationId", "createdAt");

CREATE UNIQUE INDEX "BotBillingProviderConfig_workspace_default_unique"
ON "BotBillingProviderConfig"("workspaceId", "provider", "mode")
WHERE "botIntegrationId" IS NULL;

CREATE UNIQUE INDEX "FinanceAiProviderConfig_workspace_default_unique"
ON "FinanceAiProviderConfig"("workspaceId", "provider")
WHERE "botIntegrationId" IS NULL;

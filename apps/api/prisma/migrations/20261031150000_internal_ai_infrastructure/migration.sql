-- Internal Operations AI only; Consumer Finance AI tables are unchanged.
CREATE TABLE "AiWorkspaceConfig" (
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "automaticEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyBudget" DECIMAL(24,12),
    "monthlyBudget" DECIMAL(24,12),
    "maxRequestCost" DECIMAL(24,12),
    "warningPercent" INTEGER NOT NULL DEFAULT 80,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiWorkspaceConfig_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "AiCategoryConfig" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "modelId" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "automaticEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxInputTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "timeoutMs" INTEGER NOT NULL,
    "concurrencyLimit" INTEGER NOT NULL,
    "dailyBudget" DECIMAL(24,12),
    "monthlyBudget" DECIMAL(24,12),
    "maxRequestCost" DECIMAL(24,12),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCategoryConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationId" VARCHAR(100) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "providerModel" VARCHAR(100),
    "mode" VARCHAR(16) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "pricingStatus" VARCHAR(24) NOT NULL,
    "reservedCost" DECIMAL(24,12) NOT NULL,
    "actualCost" DECIMAL(24,12),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "durationMs" INTEGER,
    "errorCategory" VARCHAR(64),
    "providerRequestId" VARCHAR(200),
    "businessObjectId" VARCHAR(100),
    "configurationSnapshot" JSONB NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "pricingVersion" TEXT,
    "pricingEffectiveAt" TIMESTAMP(3),
    "reconciliationReference" VARCHAR(120),
    "reconciledByUserId" TEXT,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiBudgetPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "period" VARCHAR(8) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "spent" DECIMAL(24,12) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(24,12) NOT NULL DEFAULT 0,

    CONSTRAINT "AiBudgetPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsageDaily" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "pricedRequests" INTEGER NOT NULL DEFAULT 0,
    "unpricedRequests" INTEGER NOT NULL DEFAULT 0,
    "unknownUsageRequests" INTEGER NOT NULL DEFAULT 0,
    "knownCost" DECIMAL(24,12) NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "cachedInputTokens" BIGINT NOT NULL DEFAULT 0,
    "cacheWriteTokens" BIGINT NOT NULL DEFAULT 0,
    "reasoningTokens" BIGINT NOT NULL DEFAULT 0,
    "totalTokens" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "AiUsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCategoryConfig_workspaceId_category_key" ON "AiCategoryConfig"("workspaceId", "category");

CREATE INDEX "AiOperation_workspaceId_createdAt_id_idx" ON "AiOperation"("workspaceId", "createdAt", "id");

CREATE INDEX "AiOperation_workspaceId_category_createdAt_id_idx" ON "AiOperation"("workspaceId", "category", "createdAt", "id");

CREATE INDEX "AiOperation_workspaceId_status_deadlineAt_idx" ON "AiOperation"("workspaceId", "status", "deadlineAt");

CREATE INDEX "AiOperation_expiresAt_id_idx" ON "AiOperation"("expiresAt", "id");

CREATE UNIQUE INDEX "AiOperation_workspaceId_operationId_key" ON "AiOperation"("workspaceId", "operationId");

CREATE INDEX "AiBudgetPeriod_periodEnd_id_idx" ON "AiBudgetPeriod"("periodEnd", "id");

CREATE UNIQUE INDEX "AiBudgetPeriod_workspaceId_scope_period_periodStart_key" ON "AiBudgetPeriod"("workspaceId", "scope", "period", "periodStart");

CREATE INDEX "AiUsageDaily_workspaceId_day_idx" ON "AiUsageDaily"("workspaceId", "day");

CREATE INDEX "AiUsageDaily_day_id_idx" ON "AiUsageDaily"("day", "id");

CREATE UNIQUE INDEX "AiUsageDaily_dimensions_key" ON "AiUsageDaily"("workspaceId", "day", "category", "provider", "model", "status");

ALTER TABLE "AiWorkspaceConfig" ADD CONSTRAINT "AiWorkspaceConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiCategoryConfig" ADD CONSTRAINT "AiCategoryConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiBudgetPeriod" ADD CONSTRAINT "AiBudgetPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiUsageDaily" ADD CONSTRAINT "AiUsageDaily_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_nonnegative_cost" CHECK ("reservedCost" >= 0 AND ("actualCost" IS NULL OR "actualCost" >= 0));
ALTER TABLE "AiBudgetPeriod" ADD CONSTRAINT "AiBudgetPeriod_nonnegative" CHECK ("spent" >= 0 AND "reserved" >= 0);
ALTER TABLE "AiUsageDaily" ADD CONSTRAINT "AiUsageDaily_nonnegative" CHECK ("requests" >= 0 AND "errors" >= 0 AND "pricedRequests" >= 0 AND "unpricedRequests" >= 0 AND "knownCost" >= 0);

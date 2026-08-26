CREATE TYPE "TelegramSystemBotWorkflowKind" AS ENUM ('POST_IMPORT', 'AD_SALE');

CREATE TYPE "TelegramSystemBotWorkflowStatus" AS ENUM (
  'ACTIVE',
  'COMMITTING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TABLE "TelegramSystemBotWorkflow" (
  "id" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" "TelegramSystemBotWorkflowKind" NOT NULL,
  "step" TEXT NOT NULL,
  "status" "TelegramSystemBotWorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "controlMessageId" INTEGER,
  "payload" JSONB NOT NULL,
  "resultManagedPostId" TEXT,
  "resultAdSaleId" TEXT,
  "resultAdSalePlacementId" TEXT,
  "lastError" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramSystemBotWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramSystemBotWorkflow_active_idx"
ON "TelegramSystemBotWorkflow"("connectionId", "workspaceId", "status", "expiresAt");

CREATE INDEX "TelegramSystemBotWorkflow_expiry_idx"
ON "TelegramSystemBotWorkflow"("status", "expiresAt");

CREATE INDEX "TelegramSystemBotWorkflow_workspace_kind_idx"
ON "TelegramSystemBotWorkflow"("workspaceId", "kind", "status", "updatedAt");

ALTER TABLE "TelegramSystemBotWorkflow"
ADD CONSTRAINT "TelegramSystemBotWorkflow_connectionId_fkey"
FOREIGN KEY ("connectionId") REFERENCES "TelegramSystemBotConnection"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramSystemBotWorkflow"
ADD CONSTRAINT "TelegramSystemBotWorkflow_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "TelegramConfiguredBotKind" AS ENUM ('SYSTEM');

CREATE TABLE "TelegramConfiguredBotAvatar" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "TelegramConfiguredBotKind" NOT NULL,
    "environment" "TelegramBotRuntimeEnvironment" NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "image" BYTEA,
    "mimeType" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConfiguredBotAvatar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramConfiguredBotAvatar_workspaceId_kind_environment_key"
ON "TelegramConfiguredBotAvatar"("workspaceId", "kind", "environment");

CREATE INDEX "TelegramConfiguredBotAvatar_workspaceId_kind_idx"
ON "TelegramConfiguredBotAvatar"("workspaceId", "kind");

ALTER TABLE "TelegramConfiguredBotAvatar"
ADD CONSTRAINT "TelegramConfiguredBotAvatar_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

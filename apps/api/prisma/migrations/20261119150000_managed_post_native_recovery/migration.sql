-- One bounded latest native replacement attempt per managed post. No payloads or credentials.
CREATE TABLE "TelegramManagedPostNativeRecovery" (
    "postId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "oldMessageIds" TEXT[] NOT NULL,
    "newMessageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramManagedPostNativeRecovery_pkey" PRIMARY KEY ("postId"),
    CONSTRAINT "TelegramManagedPostNativeRecovery_postId_fkey" FOREIGN KEY ("postId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TelegramManagedPostNativeRecovery_workspaceId_channelId_idx" ON "TelegramManagedPostNativeRecovery"("workspaceId", "channelId");

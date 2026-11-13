ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "deliveryClaimOwner" TEXT,
  ADD COLUMN "deliveryClaimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "deliveryNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "TelegramManagedPost_status_deliveryNextAttemptAt_idx" ON "TelegramManagedPost"("status", "deliveryNextAttemptAt");
CREATE INDEX "TelegramManagedPost_deliveryClaimExpiresAt_idx" ON "TelegramManagedPost"("deliveryClaimExpiresAt");
CREATE TABLE "TelegramManagedPostSendOperation" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "sourceType" "TelegramSourceType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "messageIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "retryAt" TIMESTAMP(3),
  "errorCode" INTEGER,
  "startedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramManagedPostSendOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramManagedPostSendOperation_status_check" CHECK ("status" IN ('READY','STARTED','ACKED','REJECTED','UNKNOWN','BLOCKED')),
  CONSTRAINT "TelegramManagedPostSendOperation_ordinal_check" CHECK ("ordinal" >= 0),
  CONSTRAINT "TelegramManagedPostSendOperation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TelegramManagedPostSendOperation_postId_ordinal_key" ON "TelegramManagedPostSendOperation"("postId", "ordinal");
CREATE INDEX "ManagedPostSendOperation_workspace_channel_status_retry_idx" ON "TelegramManagedPostSendOperation"("workspaceId", "channelId", "status", "retryAt");
CREATE INDEX "TelegramManagedPostSendOperation_status_updatedAt_idx" ON "TelegramManagedPostSendOperation"("status", "updatedAt");

-- Legacy active sends have no trustworthy operation journal. Recover their
-- remote identity after rollout; never reinterpret an empty journal as no-send.
INSERT INTO "TelegramManagedPostSendOperation" (
  "id", "postId", "workspaceId", "channelId", "sourceType", "sourceId",
  "ordinal", "payloadHash", "status", "startedAt", "updatedAt"
)
SELECT 'legacy-active:' || "id", "id", "workspaceId", "telegramChannelId",
  COALESCE("sourceType", 'BOT'::"TelegramSourceType"), COALESCE("sourceId", 'legacy-unknown'),
  0, repeat('0', 64), 'UNKNOWN', "updatedAt", CURRENT_TIMESTAMP
FROM "TelegramManagedPost"
WHERE "status" = 'PUBLISHING' AND "scheduleMode" = 'LOCAL';
UPDATE "TelegramManagedPost"
SET "deliveryClaimExpiresAt" = CURRENT_TIMESTAMP,
    "deliveryAttemptCount" = 1
WHERE "status" = 'PUBLISHING' AND "scheduleMode" = 'LOCAL';

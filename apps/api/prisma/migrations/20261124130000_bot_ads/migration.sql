CREATE TABLE "BotAdPromo" (
  "id" TEXT PRIMARY KEY,
  "runtimeInstanceId" TEXT NOT NULL REFERENCES "TelegramBotRuntimeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "post" JSONB NOT NULL,
  "iconId" TEXT REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "BotAdPromo_runtimeInstanceId_archivedAt_createdAt_idx"
  ON "BotAdPromo"("runtimeInstanceId", "archivedAt", "createdAt");

CREATE TABLE "BotAdLink" (
  "id" UUID PRIMARY KEY,
  "runtimeInstanceId" TEXT NOT NULL REFERENCES "TelegramBotRuntimeInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "promoId" TEXT REFERENCES "BotAdPromo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "telegramChannelId" TEXT REFERENCES "TelegramChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "managedPostId" TEXT REFERENCES "TelegramManagedPost"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "publicationIntent" TEXT,
  "clicks" BIGINT NOT NULL DEFAULT 0,
  "tracked" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "BotAdLink_managedPostId_key" ON "BotAdLink"("managedPostId");
CREATE UNIQUE INDEX "BotAdLink_id_runtimeInstanceId_key" ON "BotAdLink"("id", "runtimeInstanceId");
CREATE INDEX "BotAdLink_runtimeInstanceId_createdAt_idx" ON "BotAdLink"("runtimeInstanceId", "createdAt");
CREATE INDEX "BotAdLink_promoId_idx" ON "BotAdLink"("promoId");

CREATE TABLE "BotAdAttribution" (
  "runtimeInstanceId" TEXT NOT NULL,
  "telegramBotUserId" TEXT NOT NULL REFERENCES "TelegramBotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "linkId" UUID NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "activatedAt" TIMESTAMP(3),
  PRIMARY KEY ("runtimeInstanceId", "telegramBotUserId"),
  CONSTRAINT "BotAdAttribution_linkId_runtimeInstanceId_fkey"
    FOREIGN KEY ("linkId", "runtimeInstanceId") REFERENCES "BotAdLink"("id", "runtimeInstanceId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BotAdAttribution_linkId_idx" ON "BotAdAttribution"("linkId");

ALTER TABLE "BotBillingEvent" ADD COLUMN "runtimeInstanceId" TEXT;
ALTER TABLE "TelegramBotUser" ADD COLUMN "pendingAdActivation" JSONB NOT NULL DEFAULT '{}';

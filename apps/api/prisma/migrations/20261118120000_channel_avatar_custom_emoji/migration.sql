ALTER TABLE "TelegramChannel"
 ADD COLUMN "avatarEmojiIconId" TEXT,
 ADD COLUMN "avatarEmojiHash" TEXT,
 ADD COLUMN "avatarEmojiStatus" TEXT NOT NULL DEFAULT 'PENDING',
 ADD COLUMN "avatarEmojiError" TEXT,
 ADD COLUMN "avatarEmojiManual" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "avatarEmojiRetryAt" TIMESTAMP(3),
 ADD COLUMN "avatarEmojiAttempts" INTEGER NOT NULL DEFAULT 0;
-- Existing selections are intentional; never replace them during migration.
UPDATE "TelegramChannel" SET "avatarEmojiManual" = true WHERE "presentationIconId" IS NOT NULL;
CREATE INDEX "TelegramChannel_avatarEmojiRetryAt_idx" ON "TelegramChannel"("avatarEmojiRetryAt");
CREATE TABLE "ChannelAvatarEmojiPack" (
 "id" INTEGER NOT NULL PRIMARY KEY, "shortName" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChannelAvatarEmojiPack_shortName_key" ON "ChannelAvatarEmojiPack"("shortName");
CREATE TABLE "ChannelAvatarEmojiAsset" (
 "hash" TEXT NOT NULL PRIMARY KEY, "imageUrl" TEXT NOT NULL, "packId" INTEGER,
 "fileId" TEXT, "fileUniqueId" TEXT, "customEmojiId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChannelAvatarEmojiAsset_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ChannelAvatarEmojiPack"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ChannelAvatarEmojiAsset_packId_idx" ON "ChannelAvatarEmojiAsset"("packId");
CREATE UNIQUE INDEX "ChannelAvatarEmojiAsset_customEmojiId_key" ON "ChannelAvatarEmojiAsset"("customEmojiId");
CREATE TABLE "ChannelAvatarEmojiPublisher" ("id" TEXT NOT NULL PRIMARY KEY, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "retryAt" TIMESTAMP(3));
INSERT INTO "ChannelAvatarEmojiPublisher" ("id") VALUES ('global');
CREATE INDEX "TelegramChannel_avatarEmojiIconId_idx" ON "TelegramChannel"("avatarEmojiIconId");
ALTER TABLE "TelegramChannel" ADD CONSTRAINT "TelegramChannel_avatarEmojiIconId_fkey" FOREIGN KEY ("avatarEmojiIconId") REFERENCES "Icon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

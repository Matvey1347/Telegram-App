ALTER TABLE "TelegramChannelNetwork"
ADD COLUMN "iconId" TEXT;

CREATE INDEX "TelegramChannelNetwork_iconId_idx"
ON "TelegramChannelNetwork"("iconId");

ALTER TABLE "TelegramChannelNetwork"
ADD CONSTRAINT "TelegramChannelNetwork_iconId_fkey"
FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

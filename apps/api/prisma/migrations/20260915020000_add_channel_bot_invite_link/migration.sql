ALTER TABLE "TelegramChannel"
ADD COLUMN "botInviteLinkId" TEXT;

CREATE INDEX "TelegramChannel_botInviteLinkId_idx"
ON "TelegramChannel"("botInviteLinkId");

ALTER TABLE "TelegramChannel"
ADD CONSTRAINT "TelegramChannel_botInviteLinkId_fkey"
FOREIGN KEY ("botInviteLinkId") REFERENCES "TelegramInviteLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

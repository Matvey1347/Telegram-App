CREATE TABLE "AdCampaignBotInviteLink" (
    "id" TEXT NOT NULL,
    "adCampaignId" TEXT NOT NULL,
    "inviteLinkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaignBotInviteLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdCampaignBotInviteLink_adCampaignId_inviteLinkId_key"
    ON "AdCampaignBotInviteLink"("adCampaignId", "inviteLinkId");
CREATE INDEX "AdCampaignBotInviteLink_inviteLinkId_idx"
    ON "AdCampaignBotInviteLink"("inviteLinkId");

ALTER TABLE "AdCampaignBotInviteLink"
    ADD CONSTRAINT "AdCampaignBotInviteLink_adCampaignId_fkey"
    FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdCampaignBotInviteLink"
    ADD CONSTRAINT "AdCampaignBotInviteLink_inviteLinkId_fkey"
    FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

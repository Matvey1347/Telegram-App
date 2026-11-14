CREATE TABLE "AdCampaignInviteLinkWindow" (
  "id" TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "inviteLinkId" TEXT NOT NULL,
  "fromDate" VARCHAR(10) NOT NULL,
  "timezone" TEXT NOT NULL,
  "joinedCount" INTEGER,
  "pendingCount" INTEGER,
  "computedAt" TIMESTAMP(3),
  CONSTRAINT "AdCampaignInviteLinkWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdCampaignInviteLinkWindow_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdCampaignInviteLinkWindow_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AdCampaignInviteLinkWindow_adCampaignId_inviteLinkId_key" ON "AdCampaignInviteLinkWindow"("adCampaignId", "inviteLinkId");
CREATE INDEX "AdCampaignInviteLinkWindow_inviteLinkId_idx" ON "AdCampaignInviteLinkWindow"("inviteLinkId");

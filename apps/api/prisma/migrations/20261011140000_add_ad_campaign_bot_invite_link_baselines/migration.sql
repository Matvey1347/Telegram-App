ALTER TABLE "AdCampaignBotInviteLink"
  ADD COLUMN "baselineJoinedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "baselineRequestedCount" INTEGER NOT NULL DEFAULT 0;

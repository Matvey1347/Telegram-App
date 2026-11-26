ALTER TABLE "AdCampaignInviteLinkWindow"
  ALTER COLUMN "fromDate" DROP NOT NULL,
  ADD COLUMN "currentRequests" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "peakPendingCount" INTEGER;

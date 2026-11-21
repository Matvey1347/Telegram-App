ALTER TABLE "AdCampaignInviteLinkWindow"
  ADD COLUMN "configurationToken" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastAttemptToken" TEXT,
  ADD COLUMN "lastAttemptStatus" TEXT,
  ADD COLUMN "lastAttemptReason" TEXT;

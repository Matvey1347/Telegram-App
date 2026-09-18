ALTER TABLE "TelegramChannel"
ADD COLUMN "broadcastInviteLinkId" TEXT,
ADD COLUMN "audienceTransferInviteLinkId" TEXT,
ADD COLUMN "internalCpm" DECIMAL(65,30);

ALTER TABLE "TelegramInviteLink"
ADD COLUMN "peakAttributedCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "TelegramInviteLink" AS link
SET "peakAttributedCount" = GREATEST(
  link."joinedCount" + link."requestedCount",
  COALESCE(
    (
      SELECT MAX(snapshot."joinedCount" + snapshot."requestedCount")
      FROM "TelegramInviteLinkSnapshot" AS snapshot
      WHERE snapshot."inviteLinkId" = link."id"
    ),
    0
  )
);

CREATE OR REPLACE FUNCTION "TelegramInviteLink_preserve_peak"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW."peakAttributedCount" = GREATEST(
      OLD."peakAttributedCount",
      NEW."peakAttributedCount",
      NEW."joinedCount" + NEW."requestedCount"
    );
  ELSE
    NEW."peakAttributedCount" = GREATEST(
      NEW."peakAttributedCount",
      NEW."joinedCount" + NEW."requestedCount"
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "TelegramInviteLink_preserve_peak_trigger"
BEFORE INSERT OR UPDATE OF "joinedCount", "requestedCount", "peakAttributedCount"
ON "TelegramInviteLink"
FOR EACH ROW EXECUTE FUNCTION "TelegramInviteLink_preserve_peak"();

CREATE INDEX "TelegramChannel_broadcastInviteLinkId_idx"
ON "TelegramChannel"("broadcastInviteLinkId");

CREATE INDEX "TelegramChannel_audienceTransferInviteLinkId_idx"
ON "TelegramChannel"("audienceTransferInviteLinkId");

CREATE INDEX "AdCampaign_workspace_channel_analytics_idx"
ON "AdCampaign"("workspaceId", "telegramChannelId", "excludeFromAnalytics");

CREATE INDEX "CrossPromotionPlan_targets_gin_idx"
ON "CrossPromotionPlan" USING GIN ("targets");

ALTER TABLE "TelegramChannel"
ADD CONSTRAINT "TelegramChannel_broadcastInviteLinkId_fkey"
FOREIGN KEY ("broadcastInviteLinkId") REFERENCES "TelegramInviteLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramChannel"
ADD CONSTRAINT "TelegramChannel_audienceTransferInviteLinkId_fkey"
FOREIGN KEY ("audienceTransferInviteLinkId") REFERENCES "TelegramInviteLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

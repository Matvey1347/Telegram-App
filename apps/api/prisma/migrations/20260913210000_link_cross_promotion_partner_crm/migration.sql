ALTER TABLE "CrossPromotionPlan"
ADD COLUMN "advertiserId" TEXT;

CREATE INDEX "CrossPromotionPlan_workspace_advertiser_date_idx"
ON "CrossPromotionPlan"("workspaceId", "advertiserId", "scheduledAt");

ALTER TABLE "CrossPromotionPlan"
ADD CONSTRAINT "CrossPromotionPlan_advertiserId_fkey"
FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

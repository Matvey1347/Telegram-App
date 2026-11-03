CREATE INDEX "CrossPromotionPlan_publisher_channel_ids_gin_idx"
ON "CrossPromotionPlan" USING GIN ("publisherChannelIds");

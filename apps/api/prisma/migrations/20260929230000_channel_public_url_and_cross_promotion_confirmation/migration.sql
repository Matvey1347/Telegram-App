ALTER TABLE "TelegramChannel" ADD COLUMN "publicInviteLinkId" TEXT;

ALTER TABLE "CrossPromotionPlan" ADD COLUMN "botPublicationConfirmedAt" TIMESTAMP(3);

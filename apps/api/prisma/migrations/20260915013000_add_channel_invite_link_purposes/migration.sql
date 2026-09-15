ALTER TABLE "TelegramChannel"
ADD COLUMN "folderDefaultInviteLinkIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mutualPromotionInviteLinkIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

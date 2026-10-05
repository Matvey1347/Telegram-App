ALTER TABLE "TelegramChannelMessageTemplate"
  ADD COLUMN "showProductViews" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "viewProductNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "showTotalViews" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "viewsEmoji" VARCHAR(32) NOT NULL DEFAULT '👁';

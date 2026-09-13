ALTER TABLE "Promo"
ADD COLUMN "plainText" TEXT,
ADD COLUMN "formattedHtml" TEXT,
ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mediaItems" JSONB NOT NULL DEFAULT '[]'::JSONB,
ADD COLUMN "buttonRows" JSONB NOT NULL DEFAULT '[]'::JSONB,
ADD COLUMN "defaultInviteLinkId" TEXT;

UPDATE "Promo"
SET "imageUrls" = ARRAY["imageData"]
WHERE "imageData" IS NOT NULL AND "imageData" <> '';

CREATE INDEX "Promo_defaultInviteLinkId_idx"
ON "Promo"("defaultInviteLinkId");

ALTER TABLE "Promo"
ADD CONSTRAINT "Promo_defaultInviteLinkId_fkey"
FOREIGN KEY ("defaultInviteLinkId") REFERENCES "TelegramInviteLink"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

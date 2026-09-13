ALTER TABLE "Promo"
ADD COLUMN "previewText" TEXT;

UPDATE "Promo"
SET "previewText" = LEFT(
  COALESCE(NULLIF(BTRIM("plainText"), ''), NULLIF(BTRIM("text"), '')),
  360
);

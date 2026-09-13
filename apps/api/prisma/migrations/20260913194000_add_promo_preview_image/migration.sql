ALTER TABLE "Promo"
ADD COLUMN "previewImageUrl" TEXT;

UPDATE "Promo"
SET "previewImageUrl" = CASE
  WHEN CARDINALITY("imageUrls") > 0
    AND "imageUrls"[1] NOT LIKE 'data:%'
    THEN "imageUrls"[1]
  WHEN "imageData" IS NOT NULL
    AND "imageData" <> ''
    AND "imageData" NOT LIKE 'data:%'
    THEN "imageData"
  ELSE NULL
END;

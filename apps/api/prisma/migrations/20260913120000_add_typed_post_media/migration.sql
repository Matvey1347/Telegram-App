ALTER TABLE "MutualPromotionFolderPost"
  ADD COLUMN "mediaItems" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "mediaItems" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "TelegramManagedPostRevision"
  ADD COLUMN "mediaItems" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "MutualPromotionFolderPost"
SET "mediaItems" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('kind', 'PHOTO', 'url', value) ORDER BY ordinal)
   FROM unnest("imageUrls") WITH ORDINALITY AS images(value, ordinal)),
  '[]'::jsonb
)
WHERE cardinality("imageUrls") > 0;

UPDATE "TelegramManagedPost"
SET "mediaItems" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('kind', 'PHOTO', 'url', value) ORDER BY ordinal)
   FROM unnest("imageUrls") WITH ORDINALITY AS images(value, ordinal)),
  '[]'::jsonb
)
WHERE cardinality("imageUrls") > 0;

UPDATE "TelegramManagedPostRevision"
SET "mediaItems" = COALESCE(
  (SELECT jsonb_agg(jsonb_build_object('kind', 'PHOTO', 'url', value) ORDER BY ordinal)
   FROM unnest("imageUrls") WITH ORDINALITY AS images(value, ordinal)),
  '[]'::jsonb
)
WHERE cardinality("imageUrls") > 0;

-- Convert the old global image style/reference settings into the current
-- per-preference model before removing the legacy JSON properties.
WITH candidates AS (
  SELECT
    settings."id",
    CASE
      WHEN jsonb_typeof(settings."configuration"->'mediaPreferences') = 'array'
        AND jsonb_array_length(settings."configuration"->'mediaPreferences') > 0
        THEN NULL
      WHEN jsonb_typeof(settings."configuration"->'imageStyles') = 'array'
        AND jsonb_array_length(settings."configuration"->'imageStyles') > 0 THEN (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', 'legacy-' || (styles.ordinality - 1)::text,
              'name', btrim(styles.value #>> '{}'),
              'description', '',
              'emoji', '🎨',
              'references', CASE
                WHEN jsonb_typeof(settings."configuration"->'imageReferenceUrls') = 'array'
                  THEN settings."configuration"->'imageReferenceUrls'
                ELSE '[]'::jsonb
              END,
              'purpose', 'BOTH'
            ) ORDER BY styles.ordinality
          ), '[]'::jsonb
        )
        FROM jsonb_array_elements(settings."configuration"->'imageStyles') WITH ORDINALITY AS styles(value, ordinality)
        WHERE jsonb_typeof(styles.value) = 'string' AND btrim(styles.value #>> '{}') <> ''
      )
      WHEN jsonb_typeof(settings."configuration"->'imageReferenceUrls') = 'array'
        AND jsonb_array_length(settings."configuration"->'imageReferenceUrls') > 0 THEN
        jsonb_build_array(jsonb_build_object(
          'id', 'legacy-default', 'name', 'Основное направление', 'description', '',
          'emoji', '🎨', 'references', settings."configuration"->'imageReferenceUrls',
          'purpose', 'BOTH'
        ))
      ELSE NULL
    END AS "mediaPreferences"
  FROM "TelegramAiPostingSettings" AS settings
  WHERE settings."configuration" ? 'imageStyles'
     OR settings."configuration" ? 'imageReferenceUrls'
)
UPDATE "TelegramAiPostingSettings" AS settings
SET "configuration" =
  (settings."configuration" - 'imageStyles' - 'imageReferenceUrls') ||
  CASE
    WHEN candidates."mediaPreferences" IS NULL THEN '{}'::jsonb
    ELSE jsonb_build_object('mediaPreferences', candidates."mediaPreferences")
  END
FROM candidates
WHERE settings."id" = candidates."id";

-- Inactive lengths were omitted from the API; discard those rows before
-- removing the now-unused soft-delete flag.
DELETE FROM "TelegramAiPostingLength" WHERE "isActive" = false;
DROP INDEX "TelegramAiPostingLength_workspaceId_telegramChannelId_isActive_idx";
ALTER TABLE "TelegramAiPostingLength" DROP COLUMN "isBuiltin";
ALTER TABLE "TelegramAiPostingLength" DROP COLUMN "isActive";
CREATE INDEX "TelegramAiPostingLength_workspaceId_telegramChannelId_idx"
  ON "TelegramAiPostingLength"("workspaceId", "telegramChannelId");

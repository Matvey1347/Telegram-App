WITH changed_configurations AS (
  SELECT
    settings."id",
    jsonb_set(
      COALESCE(settings."configuration", '{}'::jsonb),
      '{rules}',
      (
        SELECT jsonb_agg(
          CASE
            WHEN rule.value->>'source' = 'feedback'
              AND lower(trim(COALESCE(rule.value->>'text', ''))) LIKE 'ending:%'
            THEN jsonb_set(rule.value, '{active}', 'false'::jsonb, true)
            ELSE rule.value
          END
          ORDER BY rule.ordinality
        )
        FROM jsonb_array_elements(settings."configuration"->'rules')
          WITH ORDINALITY AS rule(value, ordinality)
      ),
      true
    ) AS "configuration"
  FROM "TelegramAiPostingSettings" settings
  WHERE jsonb_typeof(settings."configuration"->'rules') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(settings."configuration"->'rules') AS rule(value)
      WHERE rule.value->>'source' = 'feedback'
        AND lower(trim(COALESCE(rule.value->>'text', ''))) LIKE 'ending:%'
        AND COALESCE(rule.value->>'active', 'true') <> 'false'
    )
), updated_settings AS (
  UPDATE "TelegramAiPostingSettings" settings
  SET
    "configuration" = changed."configuration",
    "configurationVersion" = settings."configurationVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
  FROM changed_configurations changed
  WHERE settings."id" = changed."id"
  RETURNING settings."id", settings."configurationVersion", settings."configuration", settings."updatedAt"
)
INSERT INTO "TelegramAiPostingSettingsVersion" (
  "id", "settingsId", "version", "configuration", "changeSource", "changedByMemberId", "createdAt"
)
SELECT
  'settings-' || updated."id" || '-v' || updated."configurationVersion",
  updated."id",
  updated."configurationVersion",
  updated."configuration",
  'system',
  NULL,
  updated."updatedAt"
FROM updated_settings updated
ON CONFLICT ("settingsId", "version") DO NOTHING;

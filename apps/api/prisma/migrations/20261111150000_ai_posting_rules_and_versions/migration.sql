CREATE TABLE "TelegramAiPostingSettingsVersion" (
  "id" TEXT NOT NULL,
  "settingsId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "configuration" JSONB NOT NULL,
  "changeSource" TEXT NOT NULL,
  "changedByMemberId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAiPostingSettingsVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramAiPostingSettingsVersion_settingsId_version_key"
  ON "TelegramAiPostingSettingsVersion"("settingsId", "version");
CREATE INDEX "TelegramAiPostingSettingsVersion_settingsId_createdAt_idx"
  ON "TelegramAiPostingSettingsVersion"("settingsId", "createdAt");
ALTER TABLE "TelegramAiPostingSettingsVersion"
  ADD CONSTRAINT "TelegramAiPostingSettingsVersion_settingsId_fkey"
  FOREIGN KEY ("settingsId") REFERENCES "TelegramAiPostingSettings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

WITH applied AS (
  SELECT
    s."id" AS "settingsId",
    r."id" AS "runId",
    COALESCE(entry->>'id', r."id" || '-' || item.ordinality::text) AS "feedbackId",
    CASE
      WHEN entry->>'type' = 'add_rule' THEN COALESCE(entry->>'text', '')
      WHEN entry ? 'key' THEN COALESCE(entry->>'key', 'Правило') || ': ' || COALESCE(entry->>'value', '')
      ELSE COALESCE(entry->>'text', '')
    END AS "text",
    COALESCE((entry->>'createdAt')::timestamp, r."updatedAt", r."createdAt") AS "createdAt",
    row_number() OVER (
      PARTITION BY s."id", lower(trim(CASE
        WHEN entry->>'type' = 'add_rule' THEN COALESCE(entry->>'text', '')
        WHEN entry ? 'key' THEN COALESCE(entry->>'key', 'Правило') || ': ' || COALESCE(entry->>'value', '')
        ELSE COALESCE(entry->>'text', '')
      END))
      ORDER BY r."createdAt", item.ordinality
    ) AS duplicate_rank
  FROM "TelegramAiPostingSettings" s
  JOIN "TelegramAiPostingTestRun" r
    ON r."telegramChannelId" = s."telegramChannelId"
   AND r."workspaceId" = s."workspaceId"
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(r."feedback") = 'array' THEN r."feedback" ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS item(entry, ordinality)
  WHERE entry->>'status' = 'APPLIED'
), distinct_applied AS (
  SELECT * FROM applied WHERE duplicate_rank = 1 AND trim("text") <> ''
), updated_rules AS (
  SELECT s."id" AS "settingsId",
    COALESCE((
      SELECT jsonb_agg(rule ORDER BY rule_order)
      FROM (
        SELECT value AS rule, ordinality AS rule_order
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(s."configuration"->'rules') = 'array'
            THEN s."configuration"->'rules' ELSE '[]'::jsonb END
        ) WITH ORDINALITY existing(value, ordinality)
        UNION ALL
        SELECT jsonb_build_object(
          'id', 'feedback-' || a."feedbackId",
          'text', a."text",
          'source', 'feedback',
          'active', true,
          'createdAt', a."createdAt",
          'feedbackId', a."feedbackId"
        ), 1000000 + row_number() OVER (ORDER BY a."createdAt", a."feedbackId")
        FROM distinct_applied a
        WHERE a."settingsId" = s."id"
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(s."configuration"->'rules') = 'array'
                THEN s."configuration"->'rules' ELSE '[]'::jsonb END
            ) existing_rule
            WHERE lower(trim(existing_rule->>'text')) = lower(trim(a."text"))
               OR existing_rule->>'feedbackId' = a."feedbackId"
          )
      ) merged
    ), '[]'::jsonb) AS rules
  FROM "TelegramAiPostingSettings" s
  WHERE EXISTS (SELECT 1 FROM distinct_applied a WHERE a."settingsId" = s."id")
)
UPDATE "TelegramAiPostingSettings" s
SET "configuration" = jsonb_set(
  COALESCE(s."configuration", '{}'::jsonb), '{rules}', u.rules, true
)
FROM updated_rules u
WHERE s."id" = u."settingsId";

INSERT INTO "TelegramAiPostingSettingsVersion" (
  "id", "settingsId", "version", "configuration", "changeSource", "changedByMemberId", "createdAt"
)
SELECT
  'settings-' || s."id" || '-v' || s."configurationVersion",
  s."id",
  s."configurationVersion",
  s."configuration",
  'system',
  NULL,
  s."updatedAt"
FROM "TelegramAiPostingSettings" s
ON CONFLICT ("settingsId", "version") DO NOTHING;

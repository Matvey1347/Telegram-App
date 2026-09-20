-- Exchange rates are neutral system reference data. Keep one deterministic
-- observation per pair/day rather than copying the same provider graph per
-- workspace. Provider observations win over legacy manual rows; among equal
-- sources the newest row wins, with id as a stable final tie-breaker.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "baseCurrency", "targetCurrency", date
      ORDER BY
        CASE source
          WHEN 'bank.gov.ua' THEN 0
          WHEN 'frankfurter.dev' THEN 1
          WHEN 'open.er-api.com' THEN 2
          ELSE 3
        END,
        "updatedAt" DESC,
        id DESC
    ) AS rank
  FROM "ExchangeRate"
)
DELETE FROM "ExchangeRate" AS rate
USING ranked
WHERE rate.id = ranked.id
  AND ranked.rank > 1;

ALTER TABLE "ExchangeRate"
  DROP CONSTRAINT IF EXISTS "ExchangeRate_workspaceId_fkey",
  DROP CONSTRAINT IF EXISTS "ExchangeRate_workspaceId_baseCurrency_targetCurrency_date_key";

DROP INDEX IF EXISTS "ExchangeRate_workspaceId_baseCurrency_targetCurrency_date_key";

ALTER TABLE "ExchangeRate"
  DROP COLUMN IF EXISTS "workspaceId";

CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRate_baseCurrency_targetCurrency_date_key"
  ON "ExchangeRate" ("baseCurrency", "targetCurrency", date);

CREATE INDEX IF NOT EXISTS "ExchangeRate_baseCurrency_targetCurrency_date_idx"
  ON "ExchangeRate" ("baseCurrency", "targetCurrency", date DESC);

-- The former per-workspace rate task no longer owns useful work. Its runs are
-- retained for audit, but configs are removed so it cannot wake once/workspace.
DELETE FROM "ScheduledTaskConfig"
WHERE "taskKey" = 'currencies.rates.sync'
  AND scope = 'WORKSPACE_OPERATION';

-- Merge the former Telegram Ad Sales category into the canonical Ad Sales
-- category in every workspace while retaining all transaction links.
WITH category_pairs AS (
  SELECT
    legacy.id AS legacy_id,
    canonical.id AS canonical_id
  FROM "TransactionCategory" AS legacy
  JOIN "TransactionCategory" AS canonical
    ON canonical."workspaceId" = legacy."workspaceId"
   AND canonical.type = 'income'::"TransactionType"
   AND canonical.key = 'channel_advertising_revenue'
  WHERE legacy.type = 'income'::"TransactionType"
    AND legacy.id <> canonical.id
    AND (
      legacy.key = 'telegram_ad_sales'
      OR LOWER(BTRIM(legacy.name)) = 'telegram ad sales'
    )
)
UPDATE "Transaction" AS transaction
SET "categoryId" = category_pairs.canonical_id,
    category = 'Ad Sales',
    "updatedAt" = NOW()
FROM category_pairs
WHERE transaction."categoryId" = category_pairs.legacy_id;

DELETE FROM "TransactionCategory" AS legacy
USING "TransactionCategory" AS canonical
WHERE canonical."workspaceId" = legacy."workspaceId"
  AND canonical.type = 'income'::"TransactionType"
  AND canonical.key = 'channel_advertising_revenue'
  AND legacy.type = 'income'::"TransactionType"
  AND legacy.id <> canonical.id
  AND (
    legacy.key = 'telegram_ad_sales'
    OR LOWER(BTRIM(legacy.name)) = 'telegram ad sales'
  );

-- A workspace with only the former category can reuse that row as canonical.
UPDATE "TransactionCategory" AS legacy
SET key = 'channel_advertising_revenue',
    name = 'Ad Sales',
    "isSystem" = TRUE,
    "updatedAt" = NOW()
WHERE legacy.type = 'income'::"TransactionType"
  AND (
    legacy.key = 'telegram_ad_sales'
    OR LOWER(BTRIM(legacy.name)) = 'telegram ad sales'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "TransactionCategory" AS canonical
    WHERE canonical."workspaceId" = legacy."workspaceId"
      AND canonical.type = 'income'::"TransactionType"
      AND canonical.key = 'channel_advertising_revenue'
  );

UPDATE "TransactionCategory"
SET name = 'Ad Sales', "updatedAt" = NOW()
WHERE type = 'income'::"TransactionType"
  AND key = 'channel_advertising_revenue'
  AND name IS DISTINCT FROM 'Ad Sales';

UPDATE "Transaction" AS transaction
SET category = 'Ad Sales', "updatedAt" = NOW()
FROM "TransactionCategory" AS category
WHERE transaction."categoryId" = category.id
  AND category.key = 'channel_advertising_revenue'
  AND transaction.category IS DISTINCT FROM 'Ad Sales';

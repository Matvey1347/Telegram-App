-- An account opening balance is a member contribution.  Previously it was
-- stored only on Account, so the money could be transferred and spent without
-- a corresponding Investment or income transaction.
INSERT INTO "TransactionCategory" (
  id, "workspaceId", name, type, "isSystem", key, "createdAt", "updatedAt"
)
SELECT
  'sys-investment-category-' || md5(workspace.id),
  workspace.id,
  'Investment',
  'income'::"TransactionType",
  true,
  'investment',
  NOW(),
  NOW()
FROM "Workspace" AS workspace
WHERE EXISTS (
  SELECT 1
  FROM "Account" AS account
  WHERE account."workspaceId" = workspace.id
    AND account."initialBalance" > 0
    AND account."assignedMemberId" IS NOT NULL
)
ON CONFLICT ("workspaceId", type, key) DO NOTHING;

WITH opening_accounts AS (
  SELECT
    account.*,
    workspace."primaryCurrency",
    category.id AS "categoryId",
    COALESCE(
      CASE WHEN account.currency = workspace."primaryCurrency" THEN 1 END,
      (SELECT rate.rate
       FROM "ExchangeRate" AS rate
       WHERE rate."workspaceId" = account."workspaceId"
         AND rate."baseCurrency" = account.currency
         AND rate."targetCurrency" = workspace."primaryCurrency"
       ORDER BY rate.date DESC LIMIT 1),
      1 / NULLIF((SELECT rate.rate
       FROM "ExchangeRate" AS rate
       WHERE rate."workspaceId" = account."workspaceId"
         AND rate."baseCurrency" = workspace."primaryCurrency"
         AND rate."targetCurrency" = account.currency
       ORDER BY rate.date DESC LIMIT 1), 0),
      (SELECT primary_rate.rate / NULLIF(account_rate.rate, 0)
       FROM "ExchangeRate" AS primary_rate
       JOIN "ExchangeRate" AS account_rate
         ON account_rate."workspaceId" = primary_rate."workspaceId"
        AND account_rate.date = primary_rate.date
       WHERE primary_rate."workspaceId" = account."workspaceId"
         AND primary_rate."baseCurrency" = 'USD'
         AND primary_rate."targetCurrency" = workspace."primaryCurrency"
         AND account_rate."baseCurrency" = 'USD'
         AND account_rate."targetCurrency" = account.currency
       ORDER BY primary_rate.date DESC LIMIT 1),
      1
    ) AS rate
  FROM "Account" AS account
  JOIN "Workspace" AS workspace ON workspace.id = account."workspaceId"
  JOIN "TransactionCategory" AS category
    ON category."workspaceId" = account."workspaceId"
   AND category.type = 'income'::"TransactionType"
   AND category.key = 'investment'
  WHERE account."initialBalance" > 0
    AND account."assignedMemberId" IS NOT NULL
), inserted_transactions AS (
  INSERT INTO "Transaction" (
    id, "workspaceId", "accountId", type, amount, currency,
    "amountInPrimaryCurrency", "exchangeRateToPrimary", category,
    "categoryId", "memberId", description, date, "createdByUserId",
    "assignedMemberId", "createdAt", "updatedAt"
  )
  SELECT
    'opening-investment-' || md5(id),
    "workspaceId", id, 'income'::"TransactionType", "initialBalance", currency,
    "initialBalance" * rate, rate, 'Investment', "categoryId",
    "assignedMemberId", 'Opening investment', "createdAt", "createdByUserId",
    "assignedMemberId", "createdAt", NOW()
  FROM opening_accounts
  ON CONFLICT (id) DO NOTHING
  RETURNING id, "workspaceId", "accountId", amount, currency,
    "amountInPrimaryCurrency", "exchangeRateToPrimary", date,
    "createdByUserId", "assignedMemberId"
)
INSERT INTO "Investment" (
  id, "workspaceId", "workspaceMemberId", "accountId", "transactionId",
  amount, currency, "amountInPrimaryCurrency", "exchangeRateToPrimary", date,
  notes, "createdByUserId", "assignedMemberId", origin, "movementType",
  "createdAt", "updatedAt"
)
SELECT
  'opening-investment-row-' || md5(transaction.id),
  transaction."workspaceId", transaction."assignedMemberId", transaction."accountId", transaction.id,
  transaction.amount, transaction.currency, transaction."amountInPrimaryCurrency",
  transaction."exchangeRateToPrimary", transaction.date, 'Opening investment',
  transaction."createdByUserId", transaction."assignedMemberId",
  'EXTERNAL'::"InvestmentOrigin", 'CONTRIBUTION'::"InvestmentMovementType",
  NOW(), NOW()
FROM inserted_transactions AS transaction
ON CONFLICT ("transactionId") DO NOTHING;

UPDATE "Account"
SET "initialBalance" = 0, "updatedAt" = NOW()
WHERE "initialBalance" > 0
  AND "assignedMemberId" IS NOT NULL;

-- Reconcile the reported bohdan workspace.  The $1,000 Binance expense is
-- the large channel purchase.  The 17,275 UAH purchase was soft-deleted while
-- its channel still existed; restore it and fund it explicitly.
UPDATE "Transaction"
SET
  "deletedAt" = NULL,
  "amountInPrimaryCurrency" = 17275,
  "exchangeRateToPrimary" = 1,
  "updatedAt" = NOW()
WHERE id = 'cmtysnbu20mxc0kl9usflm1j1'
  AND "workspaceId" = '7b196253-497a-4d9b-9d4b-65224e1d338f';

UPDATE "TelegramChannel"
SET
  "purchaseTransactionId" = 'cmtysnbu20mxc0kl9usflm1j1',
  "acquisitionType" = 'PURCHASED',
  "updatedAt" = NOW()
WHERE id = 'cmt0ev41y9z8z0lnvt3sleqsa'
  AND "workspaceId" = '7b196253-497a-4d9b-9d4b-65224e1d338f';

WITH source AS (
  SELECT
    account."workspaceId", account.id AS "accountId", account."assignedMemberId",
    account."createdByUserId", category.id AS "categoryId"
  FROM "Account" AS account
  JOIN "TransactionCategory" AS category
    ON category."workspaceId" = account."workspaceId"
   AND category.type = 'income'::"TransactionType"
   AND category.key = 'investment'
  WHERE account.id = 'cmtdbn8y206ja0kmqglxl0htu'
)
INSERT INTO "Transaction" (
  id, "workspaceId", "accountId", type, amount, currency,
  "amountInPrimaryCurrency", "exchangeRateToPrimary", category,
  "categoryId", "memberId", description, date, "createdByUserId",
  "assignedMemberId", "createdAt", "updatedAt"
)
SELECT
  'bohdan-second-channel-investment', "workspaceId", "accountId",
  'income'::"TransactionType", 17275, 'UAH', 17275, 1,
  'Investment', "categoryId", "assignedMemberId",
  'Investment for the purchase of 💌 Улюблені листівки 💌',
  '2026-09-11T00:00:00.000Z'::timestamp,
  "createdByUserId", "assignedMemberId", NOW(), NOW()
FROM source
ON CONFLICT (id) DO NOTHING;

INSERT INTO "Investment" (
  id, "workspaceId", "workspaceMemberId", "accountId", "transactionId",
  amount, currency, "amountInPrimaryCurrency", "exchangeRateToPrimary", date,
  notes, "createdByUserId", "assignedMemberId", origin, "movementType",
  "createdAt", "updatedAt"
)
SELECT
  'bohdan-second-channel-investment-row', transaction."workspaceId",
  transaction."memberId", transaction."accountId", transaction.id,
  transaction.amount, transaction.currency, transaction."amountInPrimaryCurrency",
  transaction."exchangeRateToPrimary", transaction.date, transaction.description,
  transaction."createdByUserId", transaction."assignedMemberId",
  'EXTERNAL'::"InvestmentOrigin", 'CONTRIBUTION'::"InvestmentMovementType",
  NOW(), NOW()
FROM "Transaction" AS transaction
WHERE transaction.id = 'bohdan-second-channel-investment'
ON CONFLICT ("transactionId") DO NOTHING;

INSERT INTO "Investment" (
  "id",
  "workspaceId",
  "workspaceMemberId",
  "accountId",
  "transactionId",
  "amount",
  "currency",
  "amountInPrimaryCurrency",
  "exchangeRateToPrimary",
  "date",
  "notes",
  "createdByUserId",
  "assignedMemberId",
  "origin",
  "movementType",
  "createdAt",
  "updatedAt"
)
SELECT
  'transaction_investment_' || source_transaction."id",
  source_transaction."workspaceId",
  source_transaction."memberId",
  source_transaction."accountId",
  source_transaction."id",
  source_transaction."amount",
  source_transaction."currency",
  source_transaction."amountInPrimaryCurrency",
  source_transaction."exchangeRateToPrimary",
  source_transaction."date",
  source_transaction."description",
  source_transaction."createdByUserId",
  source_transaction."assignedMemberId",
  'EXTERNAL'::"InvestmentOrigin",
  'CONTRIBUTION'::"InvestmentMovementType",
  source_transaction."createdAt",
  source_transaction."updatedAt"
FROM "Transaction" AS source_transaction
LEFT JOIN "TransactionCategory" AS category
  ON category."id" = source_transaction."categoryId"
LEFT JOIN "Investment" AS investment
  ON investment."transactionId" = source_transaction."id"
WHERE source_transaction."deletedAt" IS NULL
  AND source_transaction."type" = 'income'
  AND source_transaction."memberId" IS NOT NULL
  AND investment."id" IS NULL
  AND (
    category."key" = 'investment'
    OR (
      source_transaction."categoryId" IS NULL
      AND lower(trim(source_transaction."category")) = 'investment'
    )
  )
ON CONFLICT ("transactionId") DO NOTHING;

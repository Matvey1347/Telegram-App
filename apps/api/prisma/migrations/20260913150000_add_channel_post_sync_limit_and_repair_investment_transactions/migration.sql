ALTER TABLE "TelegramChannel"
ADD COLUMN IF NOT EXISTS "postSyncLimit" INTEGER NOT NULL DEFAULT 50;

UPDATE "Transaction" AS target
SET "memberId" = investment."workspaceMemberId"
FROM "Investment" AS investment
WHERE investment."transactionId" = target."id"
  AND target."memberId" IS DISTINCT FROM investment."workspaceMemberId";

UPDATE "Transaction" AS target
SET
  "categoryId" = category."id",
  "category" = category."name"
FROM "Investment" AS investment
JOIN "TransactionCategory" AS category
  ON category."workspaceId" = investment."workspaceId"
 AND category."type" = 'income'
 AND category."key" = 'investment'
WHERE investment."transactionId" = target."id"
  AND (
    target."categoryId" IS DISTINCT FROM category."id"
    OR target."category" IS DISTINCT FROM category."name"
  );

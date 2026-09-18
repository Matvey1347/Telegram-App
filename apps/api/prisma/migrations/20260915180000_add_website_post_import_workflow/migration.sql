ALTER TYPE "TelegramSystemBotWorkflowKind"
ADD VALUE IF NOT EXISTS 'WEBSITE_POST_IMPORT';

CREATE TYPE "TelegramSystemBotPostImportMode" AS ENUM ('SINGLE', 'MULTIPLE');

ALTER TABLE "TelegramSystemBotWorkflow"
ADD COLUMN "postImportMode" "TelegramSystemBotPostImportMode",
ADD COLUMN "consumedAt" TIMESTAMP(3);

-- The removed website-specific flows used different HTTP routes, browser
-- storage keys, payloads, and Telegram callback formats. They cannot be
-- resumed safely through the canonical contract. Expire only unfinished
-- workflows owned by those flows so they do not block a fresh import after
-- deployment; ordinary POST_IMPORT bot workflows remain untouched.
UPDATE "TelegramSystemBotWorkflow"
SET
  "status" = 'EXPIRED',
  "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
  "version" = "version" + 1
WHERE "status" = 'ACTIVE'
  AND (
    "kind" IN ('POST_BATCH_IMPORT', 'MUTUAL_PROMOTION_POST')
    OR (
      "kind" = 'POST_IMPORT'
      AND "payload"->>'destination' IN ('AD_SALE_MODAL', 'PROMO_MODAL')
    )
  );

ALTER TABLE "TelegramChannel"
ADD COLUMN "shortDescription" TEXT;

-- Preserve the descriptions that users entered before the presentation field
-- was separated from Telegram's remotely synchronized channel description.
UPDATE "TelegramChannel"
SET "shortDescription" = "description"
WHERE "shortDescription" IS NULL
  AND NULLIF(BTRIM("description"), '') IS NOT NULL;

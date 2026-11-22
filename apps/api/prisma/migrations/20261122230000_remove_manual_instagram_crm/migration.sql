-- Remove the retired Manual Instagram CRM workflow and its derived timestamps.
DROP INDEX IF EXISTS "TelegramAdvertiserActivity_instagram_manual_retention_idx";
ALTER TABLE "TelegramAdvertiser" DROP COLUMN IF EXISTS "manualInstagramContactAt";
ALTER TABLE "TelegramAdvertiser" DROP COLUMN IF EXISTS "manualInstagramReplyAt";

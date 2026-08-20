-- The preceding data migration needs a default to backfill existing rows.
-- Runtime environment is now always supplied explicitly by the application.
ALTER TABLE "TelegramSystemBotUpdateLog"
ALTER COLUMN "environment" DROP DEFAULT;

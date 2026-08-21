-- The 20260822040000 migration was already recorded in deployed databases.
-- Its predecessor created this uniqueness rule as an index rather than a
-- constraint, so the earlier DROP CONSTRAINT is a no-op. Remove the legacy
-- per-integration identity rule so Local and Production runtimes can each
-- have a user row for the same Telegram account.
DROP INDEX IF EXISTS "TelegramBotUser_botIntegrationId_telegramUserId_key";

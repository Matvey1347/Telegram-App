-- Cache the Telegram presentation owned by Finance so the Nexeloq dashboard
-- never has to contact Telegram while merely rendering a bot card.
ALTER TABLE "FinanceBot"
  ADD COLUMN "telegramDisplayName" TEXT,
  ADD COLUMN "avatarImage" BYTEA,
  ADD COLUMN "avatarMimeType" TEXT,
  ADD COLUMN "avatarFetchedAt" TIMESTAMP(3);

-- Adds Finance-owned configured bot identity without changing or deleting
-- existing Finance or Nexeloq records. Existing rows remain valid until a
-- selected LOCAL or PRODUCTION runtime resolves its primary FinanceBot.
CREATE TYPE "FinanceBotRuntimeEnvironment" AS ENUM ('LOCAL', 'PRODUCTION');

ALTER TABLE "FinanceBot"
  ADD COLUMN "telegramUsername" TEXT,
  ADD COLUMN "runtimeEnvironment" "FinanceBotRuntimeEnvironment";

CREATE UNIQUE INDEX "FinanceBot_telegramUsername_key" ON "FinanceBot"("telegramUsername");
CREATE UNIQUE INDEX "FinanceBot_runtimeEnvironment_key" ON "FinanceBot"("runtimeEnvironment");

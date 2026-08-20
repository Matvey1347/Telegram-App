import type { TelegramBot } from "@/lib/api";
import type { TelegramBotRuntimeEnvironment } from "@telegram-system/shared";
import { AccessBotSummary } from "./access-bot-summary";
import { BotCardShell } from "./bot-card-shell";
import { FinanceBotSummary } from "./finance-bot-summary";
import { GreeterBotSummary } from "./greeter-bot-summary";

export function TelegramBotCard({
  bot,
  checkingEnvironment,
  onCheck,
  onDelete,
  onSwitch,
  onConfigureRuntime,
  onRemoveRuntime,
}: {
  bot: TelegramBot;
  checkingEnvironment: TelegramBotRuntimeEnvironment | null;
  onCheck: (environment: TelegramBotRuntimeEnvironment) => void;
  onDelete: () => void;
  onSwitch: () => void;
  onConfigureRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onRemoveRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
}) {
  const appType = bot.applicationType;
  return (
    <BotCardShell
      bot={bot}
      checkingEnvironment={checkingEnvironment}
      onCheck={onCheck}
      onDelete={onDelete}
      onSwitch={onSwitch}
      onConfigureRuntime={onConfigureRuntime}
      onRemoveRuntime={onRemoveRuntime}
    >
      {appType === "FINANCE" ? (
        <FinanceBotSummary summary={bot.applicationSummary?.finance} />
      ) : appType === "GREETER" ? (
        <GreeterBotSummary />
      ) : (
        <AccessBotSummary summary={bot.channelAccessSummary} />
      )}
    </BotCardShell>
  );
}

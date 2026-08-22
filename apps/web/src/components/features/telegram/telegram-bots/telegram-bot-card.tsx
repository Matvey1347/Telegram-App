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
  onRequestDelete,
  onSwitch,
  onConfigureRuntime,
  onEditProfile,
}: {
  bot: TelegramBot;
  checkingEnvironment: TelegramBotRuntimeEnvironment | null;
  onCheck: (environment: TelegramBotRuntimeEnvironment) => void;
  onRequestDelete: (environment: TelegramBotRuntimeEnvironment) => void;
  onSwitch: () => void;
  onConfigureRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onEditProfile?: (environment: TelegramBotRuntimeEnvironment) => void;
}) {
  const appType = bot.applicationType;
  return (
    <BotCardShell
      bot={bot}
      checkingEnvironment={checkingEnvironment}
      onCheck={onCheck}
      onRequestDelete={onRequestDelete}
      onSwitch={onSwitch}
      onConfigureRuntime={onConfigureRuntime}
      onEditProfile={onEditProfile}
    >
      {appType === "FINANCE" ? (environment: TelegramBotRuntimeEnvironment) => (
        <FinanceBotSummary summary={bot.applicationSummary?.finance?.[environment]} />
      ) : appType === "GREETER" ? (
        <GreeterBotSummary />
      ) : (
        <AccessBotSummary summary={bot.channelAccessSummary} />
      )}
    </BotCardShell>
  );
}

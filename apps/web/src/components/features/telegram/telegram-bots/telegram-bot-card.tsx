import type { TelegramBot } from "@/lib/api";
import type {
  SupportBotView,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import { AccessBotSummary } from "./access-bot-summary";
import { BotCardShell } from "./bot-card-shell";
import { SupportCardLink } from "./telegram-support-inbox";
import { FinanceBotSummary } from "./finance-bot-summary";

export function TelegramBotCard({
  bot,
  support,
  onSupport,
  checkingEnvironment,
  onCheck,
  onRequestDelete,
  onSwitch,
  onConfigureRuntime,
  onEditProfile,
}: {
  bot: TelegramBot;
  support?: SupportBotView;
  onSupport?: () => void;
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
      {appType === "FINANCE" ? (
        () => (
          <div className="space-y-3">
            <FinanceBotSummary
              summary={
                bot.applicationSummary?.finance?.PRODUCTION ??
                bot.applicationSummary?.finance?.LOCAL
              }
            />
            {onSupport && <SupportCardLink bot={support} onOpen={onSupport} />}
          </div>
        )
      ) : (
        <AccessBotSummary summary={bot.channelAccessSummary} />
      )}
    </BotCardShell>
  );
}

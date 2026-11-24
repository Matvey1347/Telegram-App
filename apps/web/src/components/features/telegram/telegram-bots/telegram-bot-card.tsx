import type { TelegramBot } from "@/lib/api";
import type {
  SupportBotView,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import { AccessBotSummary } from "./access-bot-summary";
import { BotCardShell } from "./bot-card-shell";
import { BotAudienceMetrics } from "./bot-audience-metrics";

export function TelegramBotCard({
  bot,
  support,
  checkingEnvironment,
  onCheck,
  onRequestDelete,
  onSwitch,
  onConfigureRuntime,
  onEditProfile,
}: {
  bot: TelegramBot;
  support?: SupportBotView;
  checkingEnvironment: TelegramBotRuntimeEnvironment | null;
  onCheck: (environment: TelegramBotRuntimeEnvironment) => void;
  onRequestDelete: (environment: TelegramBotRuntimeEnvironment) => void;
  onSwitch: () => void;
  onConfigureRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onEditProfile?: (environment: TelegramBotRuntimeEnvironment) => void;
}) {
  const appType = bot.applicationType;
  const finance = bot.applicationSummary?.finance;
  const summary = finance?.PRODUCTION ?? finance?.LOCAL;
  return (
    <BotCardShell
      bot={bot}
      checkingEnvironment={checkingEnvironment}
      onCheck={onCheck}
      onRequestDelete={onRequestDelete}
      onSwitch={onSwitch}
      onConfigureRuntime={onConfigureRuntime}
      onEditProfile={onEditProfile}
      support={appType === "FINANCE" ? support : undefined}
    >
      {appType === "FINANCE" ? (
        <BotAudienceMetrics
          label="Finance business metrics"
          registered={summary?.registeredUsers}
          active={summary?.activeUsers}
          paid={{ total: summary?.paidUsers, active: summary?.activePaidUsers }}
        />
      ) : (
        <AccessBotSummary summary={bot.channelAccessSummary} />
      )}
    </BotCardShell>
  );
}

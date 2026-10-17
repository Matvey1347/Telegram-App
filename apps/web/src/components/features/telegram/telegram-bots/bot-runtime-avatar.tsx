import { Bot, Wallet } from "lucide-react";
import type { TelegramBotApplicationType } from "@telegram-system/shared";

export function BotRuntimeAvatar({
  type,
  avatarUrl,
}: {
  type: TelegramBotApplicationType;
  avatarUrl?: string | null;
}) {
  const isFinanceBot = type === "FINANCE";
  const Icon = isFinanceBot ? Wallet : Bot;
  const tone =
    isFinanceBot
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <div
      aria-label={`${isFinanceBot ? "Finance" : "Access"} bot`}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full rounded-lg object-cover" />
      ) : (
        <Icon size={20} aria-hidden="true" />
      )}
    </div>
  );
}

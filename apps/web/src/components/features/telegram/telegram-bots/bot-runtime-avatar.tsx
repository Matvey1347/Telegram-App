import { Bot, Handshake, Wallet } from "lucide-react";
import type { TelegramBotApplicationType } from "@telegram-system/shared";

export function BotRuntimeAvatar({
  type,
  avatarUrl,
}: {
  type: TelegramBotApplicationType;
  avatarUrl?: string | null;
}) {
  const Icon = type === "GREETER" ? Handshake : type === "FINANCE" ? Wallet : Bot;
  const tone =
    type === "FINANCE"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : type === "GREETER"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <div
      aria-label={`${type === "FINANCE" ? "Finance" : type === "GREETER" ? "Greeter" : "Access"} bot`}
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

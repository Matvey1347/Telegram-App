import type { SupportBotView, SupportProduct } from "@telegram-system/shared";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";

const profiles = {
  NEXELOQ: { name: "Nexeloq Support", avatar: "/brand/nexeloq-support.png" },
  GROSHLY: { name: "Groshly Support", avatar: "/brand/groshly-support.png" },
} as const;

export function SupportBotIdentity({
  product,
  bot,
}: {
  product: SupportProduct;
  bot?: SupportBotView;
}) {
  const profile = profiles[product];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <BotRuntimeAvatar type="SUPPORT" avatarUrl={profile.avatar} />
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-white">
          {profile.name}
        </h3>
        <p className="truncate text-sm text-neutral-400">
          {bot?.configured && bot.username
            ? `@${bot.username.replace(/^@/, "")}`
            : bot?.configured === false
              ? "Support bot is not configured"
              : "Telegram username unavailable"}
        </p>
      </div>
    </div>
  );
}

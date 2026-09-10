import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import Image from "next/image";

export function FinanceProfileAvatar({
  profile,
  showName = false,
}: {
  profile: ConsumerFinanceProfile;
  showName?: boolean;
}) {
  const { telegramUser } = profile;
  const initials =
    telegramUser.displayName
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "TG";
  return (
    <div
      className="flex min-w-0 items-center gap-2.5"
      aria-label={telegramUser.displayName}
      title={telegramUser.displayName}
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-700 bg-sky-500/15 text-[11px] font-semibold text-sky-200">
        <span aria-hidden="true">{initials}</span>
        {telegramUser.avatarUrl ? (
          <Image
            src={telegramUser.avatarUrl}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="absolute inset-0 h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.hidden = true;
            }}
          />
        ) : null}
      </span>
      {showName ? (
        <span className="min-w-0 text-xs">
          <span className="block truncate font-medium text-neutral-200">
            {telegramUser.displayName}
          </span>
          <span className="mt-0.5 block truncate text-neutral-500">
            {telegramUser.username
              ? `@${telegramUser.username}`
              : `${profile.defaultCurrency} · ${profile.timezone}`}
          </span>
        </span>
      ) : null}
    </div>
  );
}

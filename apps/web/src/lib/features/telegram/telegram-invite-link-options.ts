import type { TelegramInviteLink } from "@/lib/api-types";

export function telegramInviteLinkOptionLabel(
  link: Pick<TelegramInviteLink, "name">,
) {
  return link.name;
}

export function telegramInviteLinkDefaultBadgeClassName(
  link: Pick<TelegramInviteLink, "isDefaultForChannel">,
) {
  return link.isDefaultForChannel
    ? "inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap after:inline-flex after:h-5 after:w-5 after:shrink-0 after:items-center after:justify-center after:rounded-full after:border after:border-sky-700 after:bg-sky-950/70 after:text-[11px] after:font-medium after:text-sky-300 after:content-['★']"
    : undefined;
}

export function isTelegramInviteLink(value: string) {
  return /^https:\/\/t\.me\/(?:\+|joinchat\/)[A-Za-z0-9_-]+$/i.test(
    value.trim(),
  );
}

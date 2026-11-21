"use client";

import { IconAvatar } from "@/components/icons/icon-avatar";
import { type ResolvedEmoji, type TelegramManagedPost } from "@/lib/api";
import { TELEGRAM_MANAGED_POST_STATUS_KEYS } from "@telegram-system/shared";

export function wantsNewTab(event: Pick<MouseEvent, "metaKey" | "ctrlKey">) {
  return event.metaKey || event.ctrlKey;
}
export function managedPostStatusKey(status: TelegramManagedPost["status"]) {
  return TELEGRAM_MANAGED_POST_STATUS_KEYS[status];
}
export function PostIcon({
  iconId,
  icon,
  label,
  size = "xs",
  bare = false,
}: {
  iconId?: string | null;
  icon?: ResolvedEmoji | null;
  label: string;
  size?: "xs" | "sm" | "md";
  bare?: boolean;
}) {
  if (!iconId && !icon) return null;
  const isTelegramSystemGroupIcon =
    icon?.type === "image" &&
    (icon?.name === "telegram-system-group-icon" ||
      iconId === "telegram-system-group-icon" ||
      iconId === "telegram-system-group-icon");
  return (
    <IconAvatar
      icon={icon}
      label={label}
      size={size}
      bordered={!bare && !isTelegramSystemGroupIcon}
      className={
        bare || isTelegramSystemGroupIcon ? "!border-0 !bg-transparent" : ""
      }
    />
  );
}

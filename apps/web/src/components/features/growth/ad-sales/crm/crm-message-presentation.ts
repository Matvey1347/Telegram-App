import type { CrmMessageListItem } from "@telegram-system/shared";

export function crmMessageOriginLabel(message: CrmMessageListItem) {
  if (message.origin === "TELEGRAM_SYNC") return "Telegram history";
  if (message.origin === "AUTOMATION") return "Automated";
  if (message.origin === "SYSTEM") return "System";
  return `Manual${message.sentByMember ? ` · Member: ${message.sentByMember.name}` : ""}`;
}

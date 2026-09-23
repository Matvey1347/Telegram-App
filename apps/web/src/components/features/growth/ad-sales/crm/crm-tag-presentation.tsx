import type { CrmTagSummary } from "@telegram-system/shared";
import { Send } from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";

const normalizeEmoji = (value: string) => value.replace(/\uFE0F/g, "");

export function crmTagDisplayName(tag: CrmTagSummary) {
  if (!tag.emojiPresentation || tag.emojiPresentation.type !== "unicode") {
    return tag.name;
  }
  const [firstToken, ...rest] = tag.name.trim().split(/\s+/);
  return normalizeEmoji(firstToken) === normalizeEmoji(tag.emojiPresentation.value)
    ? rest.join(" ")
    : tag.name;
}

export function CrmTagEmoji({ tag }: { tag: CrmTagSummary }) {
  if (!tag.emojiPresentation) return null;
  return (
    <IconAvatar
      icon={tag.emojiPresentation}
      label={tag.name}
      size="xs"
      bordered={false}
      decorative
      className="!h-4 !w-4 !bg-transparent text-xs"
    />
  );
}

export function CrmTelegramFolderBadge({ tag }: { tag: CrmTagSummary }) {
  if (!tag.systemKey?.startsWith("TELEGRAM_FOLDER:")) return null;
  return <Send aria-label="Synced Telegram folder" size={11} className="shrink-0 text-sky-400" />;
}

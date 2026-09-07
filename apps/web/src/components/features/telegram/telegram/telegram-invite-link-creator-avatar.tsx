import type { ResolvedEmoji } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";

export function TelegramInviteLinkCreatorAvatar({
  photoUrl,
  memberAvatar,
  label,
}: {
  photoUrl?: string | null;
  memberAvatar?: ResolvedEmoji | null;
  label: string;
}) {
  const imageUrl =
    photoUrl || (memberAvatar?.type === "image" ? memberAvatar.url : null);
  if (imageUrl) {
    return (
      <TelegramEntityAvatar
        imageUrl={imageUrl}
        kind="mtproto"
        size="xs"
        alt={label}
      />
    );
  }
  if (memberAvatar?.type === "unicode") {
    return (
      <IconAvatar
        icon={memberAvatar}
        label={label}
        size="xs"
        bordered={false}
      />
    );
  }
  return <TelegramEntityAvatar kind="mtproto" size="xs" alt={label} />;
}

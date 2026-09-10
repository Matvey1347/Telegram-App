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
  const emojiFallback = /\p{Extended_Pictographic}/u.test(label) ? (
    <span className="flex h-full w-full items-center justify-center bg-violet-400 text-sm leading-none text-white">
      {label}
    </span>
  ) : null;
  if (memberAvatar) {
    return (
      <IconAvatar
        icon={memberAvatar}
        label={label}
        size="xs"
        bordered={false}
        className="rounded-full"
      />
    );
  }
  if (photoUrl) {
    return (
      <TelegramEntityAvatar
        imageUrl={photoUrl}
        kind="mtproto"
        size="xs"
        alt={label}
        fallback={emojiFallback}
      />
    );
  }
  if (emojiFallback) {
    return (
      <IconAvatar
        label={label}
        size="xs"
        bordered={false}
        className="rounded-full !bg-violet-400"
      />
    );
  }
  return <TelegramEntityAvatar kind="mtproto" size="xs" alt={label} />;
}

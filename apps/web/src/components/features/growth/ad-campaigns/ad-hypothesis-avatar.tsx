import type { AdHypothesis } from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";

export function AdHypothesisAvatar({
  hypothesis,
}: {
  hypothesis: AdHypothesis;
}) {
  const channel =
    hypothesis.isSystem && hypothesis.systemScope?.kind === "channel"
      ? hypothesis.telegramChannel
      : null;

  if (channel) {
    return (
      <TelegramEntityAvatar
        imageUrl={channel.photoUrl}
        kind="channel"
        alt={channel.title}
        size="xs"
      />
    );
  }

  return hypothesis.iconPresentation ? (
    <IconAvatar
      icon={hypothesis.iconPresentation}
      label={hypothesis.name}
      size="xs"
      bordered={false}
      className="!bg-transparent"
    />
  ) : null;
}

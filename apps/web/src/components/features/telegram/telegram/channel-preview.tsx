import { Eye, Smile, Users } from "lucide-react";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";

type ChannelPreviewProps = {
  channel: {
    title?: unknown;
    currentSubscribersCount?: unknown;
    username?: unknown;
    telegramChatId?: unknown;
    photoUrl?: string | null;
    preview?: {
      audience?: {
        viewRate?: number | null;
        reactionRate?: number | null;
      } | null;
    } | null;
  };
  rightAction?: React.ReactNode;
  subtitle?: string;
  avatarKind?: "channel" | "mtproto" | "person";
  className?: string;
  badges?: React.ReactNode;
};

export function ChannelPreview({
  channel,
  rightAction,
  subtitle,
  avatarKind = "channel",
  className = "",
  badges,
}: ChannelPreviewProps) {
  const title = String(channel?.title || "-");
  const subscribers =
    channel?.currentSubscribersCount == null
      ? null
      : Number(channel.currentSubscribersCount);
  const fallbackSubtitle =
    subscribers != null && Number.isFinite(subscribers)
      ? subscribers.toLocaleString("en-US").replace(/,/g, " ")
      : channel?.username
        ? `@${String(channel.username).replace(/^@/, "")}`
        : channel?.telegramChatId
          ? `ID ${channel.telegramChatId}`
          : "";
  const rawViewRate = channel.preview?.audience?.viewRate;
  const viewRate = Number(rawViewRate);
  const showViewRate =
    !subtitle && rawViewRate != null && Number.isFinite(viewRate);
  const rawReactionRate = channel.preview?.audience?.reactionRate;
  const reactionRate = Number(rawReactionRate);
  const showReactionRate =
    !subtitle && rawReactionRate != null && Number.isFinite(reactionRate);
  return (
    <div
      className={`mb-4 flex items-start justify-between gap-3 rounded-lg border border-neutral-700 bg-slate-900/70 p-3 ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <TelegramEntityAvatar
          imageUrl={channel?.photoUrl}
          kind={avatarKind}
          alt={title}
          size="lg"
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-none text-white">
            {title}
          </p>
          {subtitle || fallbackSubtitle ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <p className="inline-flex items-center gap-1.5 truncate">
                {subtitle || fallbackSubtitle}
                {!subtitle &&
                subscribers != null &&
                Number.isFinite(subscribers) ? (
                  <Users
                    size={14}
                    className="shrink-0 text-violet-300"
                    aria-label="Subscribers"
                  />
                ) : null}
              </p>
              {showViewRate ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-slate-400">
                  <span className="text-neutral-600" aria-hidden="true">
                    /
                  </span>
                  <Eye size={14} className="text-sky-300" aria-hidden="true" />
                  {viewRate.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  })}
                  %
                </span>
              ) : null}
              {showReactionRate ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-slate-400">
                  <span className="text-neutral-600" aria-hidden="true">
                    /
                  </span>
                  <Smile
                    size={14}
                    className="text-amber-300"
                    aria-label="Reaction rate"
                  />
                  {reactionRate.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  })}
                  %
                </span>
              ) : null}
            </div>
          ) : null}
          {badges ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {badges}
            </div>
          ) : null}
        </div>
      </div>
      {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
    </div>
  );
}

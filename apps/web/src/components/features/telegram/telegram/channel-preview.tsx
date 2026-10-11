import { Eye, Smile, UserPlus, Users } from "lucide-react";
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
      bookingSchedule?: {
        pendingJoinRequests?: number | null;
      } | null;
    } | null;
  };
  rightAction?: React.ReactNode;
  subtitle?: string;
  avatarKind?: "channel" | "mtproto" | "person";
  className?: string;
  status?: React.ReactNode;
  badges?: React.ReactNode;
  compact?: boolean;
};

export function ChannelPreview({
  channel,
  rightAction,
  subtitle,
  avatarKind = "channel",
  className = "",
  status,
  badges,
  compact = false,
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
  const pendingJoinRequests = Number(
    channel.preview?.bookingSchedule?.pendingJoinRequests ?? 0,
  );
  const showPendingJoinRequests =
    !subtitle &&
    Number.isFinite(pendingJoinRequests) &&
    pendingJoinRequests > 0;
  return (
    <div
      className={`mb-4 flex items-start justify-between ${compact ? "gap-2 p-2" : "gap-3 p-3"} rounded-lg border border-neutral-700 bg-slate-900/70 ${className}`}
    >
      <div className={`flex min-w-0 flex-1 items-start ${compact ? "gap-2" : "gap-3"}`}>
        <TelegramEntityAvatar
          imageUrl={channel?.photoUrl}
          kind={avatarKind}
          alt={title}
          size={compact ? "sm" : "lg"}
        />
        <div className="min-w-0">
          <p className={`truncate font-semibold leading-none text-white ${compact ? "text-sm" : "text-lg"}`}>
            {title}
          </p>
          {subtitle || fallbackSubtitle ? (
            <div className={`mt-1 flex flex-wrap items-start ${compact ? "gap-1 text-xs" : "gap-2 text-sm"} text-slate-300`}>
              {!subtitle &&
              subscribers != null &&
              Number.isFinite(subscribers) ? (
                <span className="inline-flex items-center gap-1.5">
                  <span>{fallbackSubtitle}</span>
                  <Users
                    size={compact ? 12 : 14}
                    className="shrink-0 text-violet-300"
                    aria-label="Subscribers"
                  />
                </span>
              ) : (
                <p className="truncate">{subtitle || fallbackSubtitle}</p>
              )}
              {showViewRate ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-slate-400">
                  <span className="text-neutral-600" aria-hidden="true">
                    /
                  </span>
                  <Eye size={compact ? 12 : 14} className="text-sky-300" aria-hidden="true" />
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
                    size={compact ? 12 : 14}
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
          {showPendingJoinRequests || status ? (
            <div className={`mt-1 flex min-h-4 flex-wrap items-center ${compact ? "gap-1" : "gap-2"}`}>
              {showPendingJoinRequests ? (
                <span className="inline-flex items-center gap-1.5">
                  <strong className="font-semibold text-white">
                    {pendingJoinRequests
                      .toLocaleString("en-US")
                      .replace(/,/g, " ")}
                  </strong>
                  <UserPlus
                  size={compact ? 12 : 14}
                    className="text-amber-300"
                    aria-label="Pending join requests"
                  />
                </span>
              ) : null}
              {status}
            </div>
          ) : null}
          {badges ? (
            <div className={`flex flex-wrap items-center ${compact ? "mt-1 gap-1" : "mt-2 gap-2"}`}>
              {badges}
            </div>
          ) : null}
        </div>
      </div>
      {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
    </div>
  );
}

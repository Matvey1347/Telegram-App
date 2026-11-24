"use client";

import { CalendarClock, Eye, Pencil, RefreshCw, Send, Trash2, UserPlus, type LucideIcon } from "lucide-react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramChannelAvatarList } from "@/components/features/telegram/telegram/telegram-channel-avatar-list";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { CardActionsMenu, CardMenuAction } from "@/components/ui/card-actions-menu";
import { formatDateTime } from "@/lib/date-format";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { useWorkspaceTimezone } from "@/hooks/use-workspace-timezone";
import { PromotionTypeBadge } from "./cross-promotion-create-steps";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion/mutual-promotion-folder-status-badge";

export function CrossPromotionPlanCard({
  plan,
  onEdit,
  onDelete,
  onResume,
  onSendToBot,
  onOpenPromo,
  onRefreshInviteLinks,
  refreshingInviteLinks = false,
}: {
  plan: CrossPromotionPlan;
  onEdit: (plan: CrossPromotionPlan) => void;
  onDelete: () => void;
  onResume?: (plan: CrossPromotionPlan) => void;
  onSendToBot?: (plan: CrossPromotionPlan) => void;
  onOpenPromo?: (promoId: string) => void;
  onRefreshInviteLinks?: (plan: CrossPromotionPlan) => void;
  refreshingInviteLinks?: boolean;
}) {
  const workspaceTimezone = useWorkspaceTimezone();
  const i18n = useOptionalI18n();
  const ownPromotion = plan.kind === "OWN_CHANNELS";
  const publishingChannels = plan.publisherResults.map((channel) => ({
    id: channel.telegramChannelId,
    title: channel.title,
    photoUrl: channel.photoUrl,
  }));
  const canEdit = plan.status !== "CANCELLED";
  const advertiser = advertiserPresentation(plan.advertiser);
  const publisherPlacements = plan.publicationPost.publisherPublications?.length
    ? plan.publicationPost.publisherPublications.flatMap((publication) => publication.placements)
    : (plan.publicationPost.publisherPlacements ?? []);
  const placementTimes = ownPromotion ? publisherPlacements.map(({ scheduledAt }) => scheduledAt) : [];
  const postsKept =
    ownPromotion &&
    plan.status === "COMPLETED" &&
    publisherPlacements.every(({ deleteAt }) => !deleteAt) &&
    plan.placementPostIds?.some(({ isPublishedInTelegram }) => isPublishedInTelegram);
  const cardScheduledAt = placementTimes.length
    ? placementTimes.reduce((earliest, current) =>
        Date.parse(current) < Date.parse(earliest) ? current : earliest,
      )
    : plan.scheduledAt;
  const publisherViews = sumKnown(plan.publisherResults.map((channel) => channel.postViews));
  const targetViews = ownPromotion
    ? plan.targetResults.map(() => publisherViews)
    : splitPublisherViews(publisherViews, plan.targetResults);

  const channelList = publishingChannels.length ? (
    <TelegramChannelAvatarList channels={publishingChannels} ariaLabel={`My channels: ${publishingChannels.length}`} />
  ) : null;

  return (
    <article className="group relative break-inside-avoid rounded-2xl border border-neutral-800 bg-neutral-950/80 pb-3 transition duration-200 hover:border-neutral-700">
      <div className="px-3 pt-3">
        <div className={ownPromotion
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
          : "flex items-start justify-between gap-3"
        }>
          <div className={ownPromotion ? "contents" : "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap"}>
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
              <IconAvatar icon={plan.iconPresentation} label={plan.title} size="xs" className="shrink-0 rounded-full" />
              <h2 className="truncate font-semibold text-white" title={plan.title}>{plan.title}</h2>
              <PromotionTypeBadge kind={plan.kind} />
            </div>
            <time
              dateTime={cardScheduledAt}
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-neutral-400 ${ownPromotion ? "col-start-1 row-start-2 lg:col-start-2 lg:row-start-1" : ""}`}
            >
              <CalendarClock size={13} aria-hidden="true" />
              {formatDateTime(cardScheduledAt, undefined, workspaceTimezone)}
            </time>
          </div>
          {ownPromotion && channelList ? (
            <div className="col-start-2 row-start-2 justify-self-end lg:col-start-3 lg:row-start-1">
              {channelList}
            </div>
          ) : null}
          <div className={`flex shrink-0 items-center gap-1 ${ownPromotion ? "col-start-2 row-start-1 justify-self-end lg:col-start-4" : ""}`}>
            <MutualPromotionFolderStatusBadge status={plan.status} />
            <CardActionsMenu label={`Actions for ${plan.title}`}>
              {canEdit ? (
                <CardMenuAction
                  label={plan.status === "DRAFT" && !plan.lastError ? "Continue draft" : "Edit promotion"}
                  icon={<Pencil size={16} />}
                  onClick={() => onEdit(plan)}
                />
              ) : null}
              {plan.status === "DRAFT" && plan.lastError && onResume ? (
                <CardMenuAction
                  label="Continue scheduling"
                  icon={<RefreshCw size={16} />}
                  onClick={() => onResume(plan)}
                />
              ) : null}
              {onSendToBot ? (
                <CardMenuAction
                  label="Send schedule to bot"
                  icon={<Send size={16} />}
                  onClick={() => onSendToBot(plan)}
                />
              ) : null}
              {onRefreshInviteLinks ? (
                <CardMenuAction
                  label="Refresh invite-link data"
                  icon={<RefreshCw size={16} className={refreshingInviteLinks ? "animate-spin" : undefined} />}
                  disabled={refreshingInviteLinks}
                  onClick={() => onRefreshInviteLinks(plan)}
                />
              ) : null}
              <CardMenuAction danger label="Delete" icon={<Trash2 size={16} />} onClick={onDelete} />
            </CardActionsMenu>
          </div>
        </div>
        {!ownPromotion && (plan.advertiser || channelList) ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {plan.advertiser ? (
              <div className="flex min-w-0 items-center gap-2">
                <TelegramEntityAvatar
                  imageUrl={advertiser.photoUrl}
                  kind="person"
                  alt={plan.advertiser.displayName}
                  size="xs"
                />
                <span className="truncate text-xs text-neutral-200">{advertiser.label}</span>
              </div>
            ) : null}
            {channelList}
          </div>
        ) : null}
        {postsKept ? (
          <p className="mt-1 text-[11px] text-neutral-400">
            {i18n?.t("ads.promotion_posts_kept") ?? "Posts remain published"}
          </p>
        ) : null}
      </div>

      {plan.status === "DRAFT" ? (
        <div
          className={`mx-4 mt-3 rounded-lg border p-3 text-xs ${plan.lastError ? "border-rose-900/70 bg-rose-950/20 text-rose-200" : "border-blue-900/70 bg-blue-950/20 text-blue-100"}`}
        >
          <p className="font-medium">{plan.lastError ? "This placement was not scheduled." : "Saved draft."}</p>
          <p className={plan.lastError ? "mt-1 text-rose-300/80" : "mt-1 text-blue-200/80"}>
            {plan.lastError || "Continue it from any device, or delete the draft when it is no longer needed."}
          </p>
        </div>
      ) : null}

      {plan.targetResults.length ? (
        <div className="mx-3 mt-2 divide-y divide-neutral-800 overflow-hidden rounded-lg border border-neutral-800 bg-black/20">
          {plan.targetResults.map((target, index) => (
            <div
              key={`target:${target.telegramChannelId}:${target.inviteLinkId}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1.2fr)] items-center gap-1.5 px-2.5 py-1.5 text-xs sm:gap-3"
            >
              <div className="flex min-w-0 items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5" title={target.title}>
                <TelegramEntityAvatar imageUrl={target.photoUrl} kind="channel" alt="" size="xs" />
                <span className="truncate font-medium text-neutral-100">{target.title}</span>
              </div>
              <Stat
                label="During placement"
                icon={UserPlus}
                value={`+${(target.joinedCount + target.requestedCount).toLocaleString()}`}
                tone="text-emerald-300"
              />
              <Stat
                label={ownPromotion || plan.targetResults.length === 1 ? "Actual views" : "Allocated placement views"}
                icon={Eye}
                value={targetViews[index]?.toLocaleString() ?? "—"}
              />
              <PromoLink
                promoId={target.promoId}
                icon={target.promoIconPresentation}
                title={target.promoTitle}
                onOpenPromo={onOpenPromo}
              />
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function sumKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function splitPublisherViews(total: number | null, targets: CrossPromotionPlan["targetResults"]) {
  if (total == null || !targets.length) return targets.map(() => null);
  const byChannel = new Map<string, CrossPromotionPlan["targetResults"]>();
  for (const target of targets) {
    const channelTargets = byChannel.get(target.telegramChannelId) ?? [];
    channelTargets.push(target);
    byChannel.set(target.telegramChannelId, channelTargets);
  }
  const channelShare = Math.floor(total / byChannel.size);
  let extra = total % byChannel.size;
  const byTarget = new Map<CrossPromotionPlan["targetResults"][number], number>();
  for (const rows of byChannel.values()) {
    const views = channelShare + (extra-- > 0 ? 1 : 0);
    rows.forEach((row, index) => {
      byTarget.set(row, Math.floor(views / rows.length) + (index < views % rows.length ? 1 : 0));
    });
  }
  return targets.map((target) => byTarget.get(target) ?? null);
}

function PromoLink({
  promoId,
  icon,
  title,
  onOpenPromo,
}: {
  promoId: string | null;
  icon: CrossPromotionPlan["targetResults"][number]["promoIconPresentation"];
  title: string;
  onOpenPromo?: (promoId: string) => void;
}) {
  const content = (
    <>
      <IconAvatar
        icon={icon}
        label={title}
        size="xs"
        className="shrink-0 rounded-full"
      />
      <span className="truncate">{title}</span>
    </>
  );
  const className =
    "flex min-w-0 items-center gap-1 truncate rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-left text-neutral-200";
  return promoId && onOpenPromo ? (
    <button
      type="button"
      onClick={() => onOpenPromo(promoId)}
      title={`Promo: ${title}. Click to open its preview.`}
      className={`${className} hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
    >
      {content}
    </button>
  ) : (
    <div className={className} title={title}>{content}</div>
  );
}

function advertiserPresentation(advertiser: CrossPromotionPlan["advertiser"]) {
  if (!advertiser) return { label: "", photoUrl: null };
  const username = advertiser.telegramUsername?.replace(/^@+/, "").trim();
  const displayName = advertiser.displayName.trim();
  const comparableName = displayName.replace(/^@+/, "");
  const repeated =
    username?.toLocaleLowerCase() === comparableName.toLocaleLowerCase();
  const primaryLabel =
    displayName || (username ? `@${username}` : "Unnamed client");
  return {
    label:
      !repeated && displayName && username
        ? `${displayName} · @${username}`
        : primaryLabel,
    photoUrl:
      advertiser.photoUrl ||
      (username ? `https://t.me/i/userpic/320/${username}.jpg` : null),
  };
}

function Stat({
  label,
  icon: Icon,
  value,
  tone = "text-neutral-200",
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  tone?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${value}`}
      title={`${label}: ${value}`}
      className={`inline-flex min-w-0 items-center gap-1 whitespace-nowrap font-medium tabular-nums ${tone}`}
    >
      <Icon size={13} aria-hidden="true" className="shrink-0" />
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

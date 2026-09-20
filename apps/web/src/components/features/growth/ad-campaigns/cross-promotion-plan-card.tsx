"use client";

import { CalendarClock, Copy, Pencil, Trash2 } from "lucide-react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramChannelAvatarList } from "@/components/features/telegram/telegram/telegram-channel-avatar-list";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import {
  CardActionsMenu,
  CardMenuAction,
} from "@/components/ui/card-actions-menu";
import { formatDateTime } from "@/lib/date-format";
import { MutualPromotionFolderStatusBadge } from "./mutual-promotion/mutual-promotion-folder-status-badge";

export function CrossPromotionPlanCard({
  plan,
  integrations,
  onCopy,
  onEdit,
  onDelete,
  onOpenPromo,
}: {
  plan: CrossPromotionPlan;
  integrations?: CrossPromotionPlan[];
  onCopy: (plan: CrossPromotionPlan) => void;
  onEdit: (plan: CrossPromotionPlan) => void;
  onDelete: () => void;
  onOpenPromo?: (promoId: string) => void;
}) {
  const publishingChannels = plan.publisherResults.map((channel) => ({
    id: channel.telegramChannelId,
    title: channel.title,
    photoUrl: channel.photoUrl,
  }));
  const partnerChannels = plan.partnerResults.map((channel) => ({
    id: channel.telegramChannelId,
    title: channel.title,
    photoUrl: channel.photoUrl,
  }));
  const canEdit = plan.status !== "CANCELLED";
  const advertiser = advertiserPresentation(plan.advertiser);
  const orderedIntegrations = integrations?.length ? integrations : [plan];
  const publisherViews = sumKnown(
    plan.publisherResults.map((channel) => channel.postViews),
  );
  const publisherAudienceDecline = sumKnown(
    plan.publisherResults.map((channel) => channel.subscribersLost),
  );

  return (
    <article className="group relative break-inside-avoid rounded-2xl border border-neutral-800 bg-neutral-950/80 transition duration-200 hover:border-neutral-700">
      <div className="p-4 pb-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <IconAvatar
                icon={plan.iconPresentation}
                label={plan.title}
                size="xs"
                className="rounded-full"
              />
              <h2 className="truncate font-semibold text-white">
                {plan.title}
              </h2>
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
              <CalendarClock size={14} /> {formatDateTime(plan.scheduledAt)}
            </p>
            {plan.advertiser ? (
              <div className="mt-2 flex items-center gap-2">
                <TelegramEntityAvatar
                  imageUrl={advertiser.photoUrl}
                  kind="person"
                  alt={plan.advertiser.displayName}
                  size="sm"
                />
                <span className="truncate text-xs text-neutral-200">
                  {advertiser.label}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <MutualPromotionFolderStatusBadge status={plan.status} />
            <CardActionsMenu label={`Actions for ${plan.title}`}>
              {canEdit ? (
                <CardMenuAction
                  label="Edit promotion"
                  icon={<Pencil size={16} />}
                  onClick={() => onEdit(plan)}
                />
              ) : null}
              <CardMenuAction
                label="Add new integration"
                icon={<Copy size={16} />}
                onClick={() => onCopy(plan)}
              />
              <CardMenuAction
                danger
                label="Delete"
                icon={<Trash2 size={16} />}
                onClick={onDelete}
              />
            </CardActionsMenu>
          </div>
        </div>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 divide-x divide-white/10 rounded-lg border border-white/5 bg-black/25 py-2">
        <ChannelMetric channels={partnerChannels} label="Partner channels" />
        <ChannelMetric channels={publishingChannels} label="My channels" />
      </div>

      {plan.status === "DRAFT" ? (
        <div className="mx-4 mt-3 rounded-lg border border-rose-900/70 bg-rose-950/20 p-3 text-xs text-rose-200">
          <p className="font-medium">This placement was not scheduled.</p>
          <p className="mt-1 text-rose-300/80">
            {plan.lastError || "Edit and retry, or delete this draft."}
          </p>
        </div>
      ) : null}

      <div className="mx-4 mb-4 mt-3 overflow-hidden rounded-lg border border-neutral-800 bg-black/20">
        {plan.targetResults.map((target) => (
          <div
            key={`target:${target.telegramChannelId}`}
            className="px-2.5 py-2"
          >
            <ChannelIdentity
              title={target.title}
              photoUrl={target.photoUrl}
              badge="✨ Promoted"
              badgeClassName="bg-emerald-950 text-emerald-300"
            />
            <div className="mt-1.5 grid grid-cols-[auto_auto_auto_minmax(0,1fr)] items-end gap-x-3 pl-7 text-[10px]">
              <Stat
                label="During placement"
                value={`+${(
                  target.joinedCount + target.requestedCount
                ).toLocaleString()}`}
                tone="text-emerald-300"
              />
              <Stat
                label="Audience decline"
                value={
                  publisherAudienceDecline == null
                    ? "—"
                    : `−${publisherAudienceDecline.toLocaleString()}`
                }
                tone="text-rose-300"
              />
              <Stat
                label="Views"
                value={
                  publisherViews == null ? "—" : publisherViews.toLocaleString()
                }
              />
              <PromoLink
                promoId={target.promoId}
                icon={target.promoIconPresentation}
                title={target.promoTitle}
                onOpenPromo={onOpenPromo}
              />
            </div>
          </div>
        ))}
      </div>

      {orderedIntegrations.length > 1 ? (
        <section className="mx-4 mt-3 rounded-lg border border-neutral-800 bg-black/20 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            Integrations · {orderedIntegrations.length}
          </p>
          <div className="mt-2 space-y-1.5">
            {orderedIntegrations.map((integration) => (
              <button
                key={integration.id}
                type="button"
                onClick={() => onEdit(integration)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-neutral-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="truncate text-neutral-200">
                  {formatDateTime(integration.scheduledAt)} ·{" "}
                  {integration.targetResults
                    .map((target) => target.title)
                    .join(", ")}
                </span>
                <span className="shrink-0 tabular-nums text-emerald-300">
                  +
                  {integration.targetResults
                    .reduce(
                      (total, target) =>
                        total + target.joinedCount + target.requestedCount,
                      0,
                    )
                    .toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}

function sumKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
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
    "flex min-w-0 items-center gap-1.5 truncate text-left text-neutral-200";
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
    <div className={className}>{content}</div>
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

function ChannelIdentity({
  title,
  photoUrl,
  badge,
  badgeClassName,
}: {
  title: string;
  photoUrl: string | null;
  badge: string;
  badgeClassName: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TelegramEntityAvatar
        imageUrl={photoUrl}
        kind="channel"
        alt=""
        size="xs"
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-100">
        {title}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] ${badgeClassName}`}
      >
        {badge}
      </span>
    </div>
  );
}

function ChannelMetric({
  channels,
  label,
}: {
  channels: Array<{ id: string; title: string; photoUrl: string | null }>;
  label: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center">
      <TelegramChannelAvatarList
        channels={channels}
        ariaLabel={`${label}: ${channels.length}`}
      />
      <p className="mt-0.5 text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "text-neutral-200",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-neutral-600">{label}</p>
      <p className={`truncate font-medium tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

"use client";

import { IconAvatar } from "@/components/icons/icon-avatar";
import { useState } from "react";
import { Check, Copy, ExternalLink, Plus } from "lucide-react";
import type {
  BotAdCampaignTotals,
  BotAdLinkView,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  EmptyState,
  FormError,
  StatusPill,
} from "@/components/ui/primitives";

const metrics = [
  ["Views", "views"],
  ["Reactions", "reactions"],
  ["Link opens", "clicks"],
  ["Bot starts", "starts"],
  ["First action", "active"],
  ["Returned after 30 days", "retained"],
  ["Paid subscribers", "paid"],
] as const;

function conversion(numerator: number, denominator: number | null) {
  return denominator
    ? new Intl.NumberFormat(undefined, {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(numerator / denominator)
    : "—";
}

function BotAdMetrics({
  data,
}: {
  data: Pick<BotAdLinkView, (typeof metrics)[number][1]>;
}) {
  return (
    <dl className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-4 xl:grid-cols-7">
      {metrics.map(([label, key]) => (
        <div key={key}>
          <dt className="text-xs text-neutral-400">{label}</dt>
          <dd className="text-lg font-semibold tabular-nums text-white">
            {data[key]?.toLocaleString() ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function BotAdCampaignSummary({
  totals,
}: {
  totals: BotAdCampaignTotals;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-white">Campaign totals</h3>
        <p className="text-sm text-neutral-400">
          {totals.published} published · {totals.placements} placements
        </p>
      </div>
      <BotAdMetrics data={totals} />
    </Card>
  );
}

function BotAdLinkCard({
  link,
  onPublish,
  onNewLink,
  onCampaign,
}: {
  link: BotAdLinkView;
  onPublish: () => void;
  onNewLink: () => void;
  onCampaign?: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const publication = link.post;
  const timestamp = publication?.publishedAt ?? publication?.scheduledAt;
  const campaign = link.campaign;
  const channelIcon =
    link.channel && "avatarPresentation" in link.channel
      ? link.channel.avatarPresentation
      : null;
  const test = link.channel && "isTest" in link.channel && link.channel.isTest;
  const canPublish =
    publication?.status === "DRAFT" || publication?.status === "FAILED";
  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 break-words font-medium text-white">
            {campaign?.iconPresentation && (
              <IconAvatar
                icon={campaign.iconPresentation}
                size="xs"
                decorative
              />
            )}
            {campaign?.title ?? link.title}
          </h3>
          <ul
            className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-300"
            aria-label="Placement details"
          >
            <li className="rounded border border-neutral-700 px-2 py-1">
              {campaign?.date ?? new Date(link.createdAt).toLocaleDateString()}
              {campaign?.plannedAt
                ? ` · ${new Date(campaign.plannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </li>
            {link.channel && (
              <li className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1">
                {channelIcon && (
                  <IconAvatar icon={channelIcon} size="xs" decorative />
                )}{" "}
                {link.channel.title}
                {test && (
                  <span className="rounded bg-amber-950 px-1 text-amber-200">
                    Test
                  </span>
                )}
              </li>
            )}
            {campaign?.networks.map((network) => (
              <li
                key={network.id}
                className="inline-flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1"
              >
                {network.iconPresentation && (
                  <IconAvatar
                    icon={network.iconPresentation}
                    size="xs"
                    decorative
                  />
                )}{" "}
                {network.name}
              </li>
            ))}
            {link.promo && (
              <li className="rounded border border-neutral-700 px-2 py-1">
                {link.promo.title}
              </li>
            )}
          </ul>
        </div>
        {publication ? <StatusPill value={publication.status} /> : null}
      </header>
      <BotAdMetrics data={link} />
      <dl
        aria-label="Placement conversion"
        className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-neutral-300"
      >
        <div className="flex gap-1">
          <dt>Views → opens</dt>
          <dd className="text-white">
            {link.clicks == null ? "—" : conversion(link.clicks, link.views)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt>Opens → starts</dt>
          <dd className="text-white">{conversion(link.starts, link.clicks)}</dd>
        </div>
        <div className="flex gap-1">
          <dt>Starts → paid</dt>
          <dd className="text-white">{conversion(link.paid, link.starts)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-3">
        <div className="min-w-0 break-all text-sm text-neutral-400">
          <a
            className="hover:text-white"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            {link.url}
          </a>
          {timestamp ? (
            <p className="mt-1">{new Date(timestamp).toLocaleString()}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void copy()}>
            {copyState === "copied" ? <Check /> : <Copy />}
            {copyState === "copied" ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" variant="secondary" onClick={onNewLink}>
            <Plus /> New link
          </Button>
          {onCampaign ? (
            <Button type="button" variant="secondary" onClick={onCampaign}>
              View campaign
            </Button>
          ) : null}
          {canPublish ? (
            <Button type="button" onClick={onPublish}>
              Publish
            </Button>
          ) : null}
          {publication?.url ? (
            <a
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue-300 hover:text-blue-100"
              href={publication.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} /> Post
            </a>
          ) : null}
        </div>
      </div>
      {copyState === "failed" ? (
        <FormError message="Could not copy the link. Select the URL to copy it manually." />
      ) : null}
    </Card>
  );
}

export function BotAdLinks({
  links,
  onPublish,
  onNewLink,
  placements,
  onCampaign,
}: {
  links: BotAdLinkView[];
  onPublish: (link: BotAdLinkView) => void;
  onNewLink: (link: BotAdLinkView) => void;
  placements: boolean;
  onCampaign?: (campaignId: string) => void;
}) {
  if (!links.length)
    return (
      <EmptyState
        text={placements ? "No placements yet." : "No invite links yet."}
      />
    );
  return (
    <div className="space-y-3">
      {links.map((link) => (
        <BotAdLinkCard
          key={link.id}
          link={link}
          onPublish={() => onPublish(link)}
          onNewLink={() => onNewLink(link)}
          onCampaign={
            link.campaignId && onCampaign
              ? onCampaign.bind(null, link.campaignId)
              : undefined
          }
        />
      ))}
      <p className="text-sm text-neutral-400">
        Bot starts count each user once per environment, on their first tracked
        link. First action counts a bot interaction or a Finance Mini App
        launch. Returned counts users with activity at least 30 days after
        starting. Paid subscribers made a successful subscription payment. Link
        opens can include repeat visits.
      </p>
    </div>
  );
}

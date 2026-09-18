"use client";

import { ArrowUpRight, RefreshCw, Send } from "lucide-react";
import type {
  CurrencySettings,
  TelegramChannel,
  TelegramChannelAdAnalysis,
} from "@/lib/api";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { ChannelPreview } from "./channel-preview";
import { ExternalChannelAdAnalysis } from "./external-channel-ad-analysis";
import { ChannelEconomicsSummary } from "./channel-economics-summary";
import { ChannelTrafficAttributionSummary } from "./channel-traffic-attribution-summary";
import {
  ChannelActionsMenu,
  ChannelMenuAction,
  ChannelMenuLink,
} from "./channel-card-actions";
import { ChannelStatusBadges } from "./channel-system-bot-access-modal";

function normalizeUsername(value?: string | null) {
  return String(value || "")
    .replace(/^@/, "")
    .trim();
}

export function TelegramChannelCatalogCard({
  channel,
  currencySettings,
  onRestore,
  onArchive,
  onDelete,
  onSync,
  onRefreshPublicData,
  onEditAnalysis,
  onDeleteAnalysis,
}: {
  channel: TelegramChannel;
  currencySettings?: CurrencySettings | null;
  onRestore: (channelId: string) => void;
  onArchive: (channelId: string) => void;
  onDelete: (channel: TelegramChannel) => void;
  onSync: (channel: TelegramChannel) => void;
  onRefreshPublicData: (username: string) => void;
  onEditAnalysis: (
    channel: TelegramChannel,
    analysis?: TelegramChannelAdAnalysis,
  ) => void;
  onDeleteAnalysis: (
    channel: TelegramChannel,
    analysis: TelegramChannelAdAnalysis,
  ) => void;
}) {
  const isOwned = Boolean(channel.adminLinks?.length);
  const username = normalizeUsername(channel.username);

  return (
    <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/55 p-4 text-sm text-neutral-300">
      <ChannelPreview
        channel={channel}
        status={
          isOwned ? (
            <ChannelStatusBadges
              connection={channel.preview?.systemBotConnection}
              archived={Boolean(channel.archivedAt)}
            />
          ) : undefined
        }
        rightAction={
          <ChannelActionsMenu
            channel={channel}
            currencySettings={currencySettings}
            archived={Boolean(channel.archivedAt)}
            canArchive={isOwned}
            onRestore={() => onRestore(channel.id)}
            onArchive={() => onArchive(channel.id)}
            onDelete={() => onDelete(channel)}
          >
            {isOwned ? (
              <ChannelMenuLink
                label="Open channel"
                href={`/telegram/channels/${channel.id}`}
                icon={<ArrowUpRight size={17} />}
              />
            ) : null}
            {isOwned && !channel.archivedAt ? (
              <ChannelMenuAction
                label="Sync channel"
                icon={<RefreshCw size={17} />}
                onClick={() => onSync(channel)}
              />
            ) : null}
            {!isOwned && username && !channel.archivedAt ? (
              <ChannelMenuAction
                label="Refresh public data"
                icon={<RefreshCw size={17} />}
                onClick={() => onRefreshPublicData(username)}
              />
            ) : null}
            {isOwned &&
            !channel.archivedAt &&
            channel.preview?.canPostMessages ? (
              <ChannelMenuLink
                label="Posts"
                href={buildTelegramPostsUrl({
                  channelId: channel.id,
                  postView: "editor",
                })}
                icon={<Send size={17} />}
              />
            ) : null}
          </ChannelActionsMenu>
        }
        className="!mb-0 !border-0 !bg-transparent !p-0"
      />
      <ChannelEconomicsSummary
        channel={channel}
        currencySettings={currencySettings}
      />
      <ChannelTrafficAttributionSummary channel={channel} />
      {!isOwned ? (
        <ExternalChannelAdAnalysis
          channel={channel}
          onEdit={(analysis) => onEditAnalysis(channel, analysis)}
          onDelete={(analysis) => onDeleteAnalysis(channel, analysis)}
        />
      ) : null}
    </div>
  );
}

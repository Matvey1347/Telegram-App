"use client";

import { Bot } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";
import { renderAdSaleBotPreview } from "./ad-sale-invite-template";

export function AdSalePlacementBotActions({
  placementKey,
  channelTitle,
  workspaceId,
  systemBotUsername,
  systemBotConnected,
  draft,
  inviteLinkUrl,
  onImported,
}: {
  placementKey: string;
  channelTitle: string;
  workspaceId?: string | null;
  systemBotUsername?: string | null;
  systemBotConnected?: boolean;
  draft?: PlacementManagedPostDraft | null;
  inviteLinkUrl?: string;
  onImported: (draft: PlacementManagedPostDraft) => void;
}) {
  const flow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey: `ad-sale-placement:${placementKey}`,
    importContext: `Ad sale · ${channelTitle}`,
    workspaceId,
    botUsername: systemBotUsername,
    enabled: true,
    previewDraft: draft ? renderAdSaleBotPreview(draft, inviteLinkUrl) : null,
    onImported,
    errorCopy: {
      read: "Could not load the post from Telegram. Try again.",
      start: "Could not prepare the bot workspace. Try again.",
      preview: "Could not send the post to the bot. Try again.",
    },
  });

  if (systemBotConnected !== true) {
    const username = systemBotUsername?.trim().replace(/^@+/, "");
    return username ? (
      <a
        href={`https://t.me/${encodeURIComponent(username)}?start=connect`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
      >
        Connect bot
      </a>
    ) : null;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-3 text-xs"
        disabled={!hasPlacementPostContent(draft) || flow.sendStatus === "working"}
        onClick={() => void flow.send()}
      >
        <Bot size={14} />
        {flow.sendStatus === "working"
          ? "Sending…"
          : flow.sendStatus === "done"
            ? "✅ Sent to bot"
            : "Send current post to bot"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-3 text-xs"
        disabled={flow.importStatus === "working" || flow.importStatus === "waiting"}
        onClick={() => void flow.startImport()}
      >
        {flow.importStatus === "working"
          ? "Sending…"
          : flow.importStatus === "waiting"
            ? "Waiting for bot…"
            : flow.importStatus === "done"
              ? "✅ Added from bot"
              : "Send from bot"}
      </Button>
      {flow.error ? (
        <p className="basis-full text-xs text-rose-300" role="alert">
          {flow.error}
        </p>
      ) : null}
    </>
  );
}

"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { TelegramChannel } from "@/lib/api";
import { Button, Tooltip } from "@/components/ui/primitives";
import { channelLocalDateKey } from "@/lib/features/growth/telegram-ad-sales";
import type { SalePlacementDraft } from "./ad-sale-types";
import { PlacementPostComposer } from "./placement-post/placement-post-composer";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";

export function AdSaleSharedPost({
  placements,
  channels,
  mode,
  systemBotConnected,
  systemBotUsername,
  workspaceId,
  onModeChange,
  setPlacements,
}: {
  placements: SalePlacementDraft[];
  channels: TelegramChannel[];
  mode: "shared" | "individual";
  systemBotConnected?: boolean;
  systemBotUsername?: string | null;
  workspaceId?: string | null;
  onModeChange: (mode: "shared" | "individual") => void;
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const first = placements[0];
  const channel = channels.find((item) => item.id === first?.channelId);
  const draft = placements.find(
    (item) => item.managedPostDraft,
  )?.managedPostDraft;
  const draftHasContent = placements.every((placement) =>
    hasPlacementPostContent(placement.managedPostDraft),
  );
  const allFuture = placements.every(
    (placement) =>
      placement.date >= channelLocalDateKey(new Date(), placement.timezone),
  );
  const botFlow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey: "ad-sale",
    importContext: "Ad sale",
    workspaceId,
    botUsername: systemBotUsername,
    onImported: (importedDraft) => {
      setExpanded(true);
      setPlacements((current) =>
        current.map((placement) => ({
          ...placement,
          managedPostDraft: importedDraft,
          telegramPostId: null,
        })),
      );
    },
    previewDraft: draft ?? null,
    errorCopy: {
      read: "Could not load the post from Telegram. Try again.",
      start: "Could not prepare the bot workspace. Try again.",
      preview: "Could not send the post to the bot. Try again.",
    },
  });
  if (!placements.length) return null;
  const isSinglePlacement = placements.length === 1;
  const normalizedSystemBotUsername = systemBotUsername
    ?.trim()
    .replace(/^@+/, "");
  const systemBotConnectUrl = normalizedSystemBotUsername
    ? `https://t.me/${encodeURIComponent(normalizedSystemBotUsername)}?start=connect`
    : null;
  return (
    <section className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">Advertising post</p>
            {!isSinglePlacement ? (
              <Tooltip
                align="left"
                content="Turn on to create one post from scratch for all channels. You can edit an individual channel copy later."
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={mode === "shared"}
                  aria-label="Use one advertising post for all channels"
                  onClick={() =>
                    onModeChange(mode === "shared" ? "individual" : "shared")
                  }
                  className={`relative inline-flex h-5 w-9 items-center rounded-full border transition ${mode === "shared" ? "border-blue-500/70 bg-blue-500/30" : "border-neutral-700 bg-neutral-900"}`}
                >
                  <span
                    className={`absolute h-3.5 w-3.5 rounded-full bg-white transition ${mode === "shared" ? "left-[17px]" : "left-1"}`}
                  />
                </button>
              </Tooltip>
            ) : null}
          </div>
          <p className="text-xs text-neutral-400">
            {isSinglePlacement
              ? "Create or import the post that will be published in this channel."
              : mode === "shared"
                ? "One post for every channel; each copy can be edited later."
                : "Configure every channel separately."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "shared" && systemBotConnected === true ? (
            draftHasContent && draft ? (
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={botFlow.sendStatus === "working"}
                aria-label={
                  botFlow.sendStatus === "working"
                    ? "Sending post to bot"
                    : botFlow.sendStatus === "done"
                      ? "Current post sent to bot"
                      : "Send current post to bot"
                }
                onClick={() => void botFlow.send()}
              >
                {botFlow.sendStatus === "working"
                  ? "Sending..."
                  : botFlow.sendStatus === "done"
                    ? "✅ Sent to bot"
                    : "Send current post to bot"}
              </Button>
            ) : null
          ) : null}
          {mode === "shared" && systemBotConnected === true ? (
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              disabled={
                botFlow.importStatus === "working" ||
                botFlow.importStatus === "waiting"
              }
              aria-label={
                botFlow.importStatus === "working"
                  ? "Sending to bot"
                  : botFlow.importStatus === "waiting" ||
                      botFlow.importStatus === "done"
                    ? "Sent to bot"
                    : "Add new post from bot"
              }
              onClick={() => void botFlow.startImport()}
            >
              {botFlow.importStatus === "working" ? (
                <span className="inline-flex min-w-[4.5rem] items-center justify-center gap-1">
                  Sending{".".repeat(botFlow.dots)}
                </span>
              ) : botFlow.importStatus === "waiting" ? (
                <span className="text-blue-100">Waiting for bot…</span>
              ) : botFlow.importStatus === "done" ? (
                <span className="inline-flex items-center gap-1 text-emerald-300">
                  ✅ Added from bot
                </span>
              ) : (
                "Add new post from bot"
              )}
            </Button>
          ) : null}
          {mode === "shared" &&
          systemBotConnected !== true &&
          systemBotConnectUrl ? (
            <a
              href={systemBotConnectUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-xs font-medium text-neutral-100 transition hover:border-neutral-600 hover:bg-neutral-800"
            >
              Connect bot
            </a>
          ) : null}
          {mode === "shared" ? (
            <Button
              type="button"
              className="h-8 px-3 text-xs"
              onClick={() => setExpanded((value) => !value)}
            >
              {draftHasContent ? "✅ Edit shared post" : "Create shared post"}
            </Button>
          ) : null}
        </div>
      </div>
      {botFlow.error ? (
        <p className="mt-2 text-xs text-rose-300">{botFlow.error}</p>
      ) : null}
      {mode === "shared" && expanded ? (
        <div className="mt-3">
          <PlacementPostComposer
            channelTitle={channel?.title ?? "Network"}
            channelPhotoUrl={channel?.photoUrl}
            draft={draft}
            existingPostId={null}
            publishedPosts={[]}
            postsLoading={false}
            canCreate={allFuture}
            autoCreate={allFuture}
            lockToDraft
            onLoadPublishedPosts={() => undefined}
            onChange={({ draft: nextDraft }) =>
              setPlacements((current) =>
                current.map((placement) => ({
                  ...placement,
                  managedPostDraft: nextDraft ?? null,
                  telegramPostId: null,
                })),
              )
            }
          />
        </div>
      ) : null}
    </section>
  );
}

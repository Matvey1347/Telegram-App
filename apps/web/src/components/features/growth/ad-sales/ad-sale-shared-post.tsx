"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TelegramChannel } from "@/lib/api";
import { Button, Tooltip } from "@/components/ui/primitives";
import { channelLocalDateKey } from "@/lib/features/growth/telegram-ad-sales";
import type { SalePlacementDraft } from "./ad-sale-types";
import {
  PlacementPostComposer,
  type PlacementManagedPostDraft,
} from "./placement-post/placement-post-composer";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";

export function AdSaleSharedPost({
  placements,
  channels,
  mode,
  systemBotConnected,
  systemBotUsername,
  onSystemBotReturn,
  onPrepareSystemBot,
  onSendSystemBotPost,
  onModeChange,
  setPlacements,
}: {
  placements: SalePlacementDraft[];
  channels: TelegramChannel[];
  mode: "shared" | "individual";
  systemBotConnected?: boolean;
  systemBotUsername?: string | null;
  onSystemBotReturn?: (
    workflowId: string,
    channelIds: string[],
  ) => Promise<PlacementManagedPostDraft | null>;
  onPrepareSystemBot?: () => Promise<string>;
  onSendSystemBotPost?: (draft: PlacementManagedPostDraft) => Promise<void>;
  onModeChange: (mode: "shared" | "individual") => void;
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [botOpenError, setBotOpenError] = useState("");
  const [botSendStatus, setBotSendStatus] = useState<
    "idle" | "sending" | "sent"
  >("idle");
  const [botSendingDots, setBotSendingDots] = useState(1);
  const [previewSendStatus, setPreviewSendStatus] = useState<
    "idle" | "sending" | "sent"
  >("idle");
  const waitingForBotRef = useRef(false);
  const botWorkflowIdRef = useRef("");
  useEffect(() => {
    if (botSendStatus !== "sending") return;
    const interval = window.setInterval(
      () => setBotSendingDots((current) => (current % 3) + 1),
      350,
    );
    return () => window.clearInterval(interval);
  }, [botSendStatus]);
  useEffect(() => {
    if (previewSendStatus !== "sent") return;
    const timeout = window.setTimeout(() => setPreviewSendStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [previewSendStatus]);

  useEffect(() => {
    if (botSendStatus !== "sent") return;
    const timeout = window.setTimeout(() => setBotSendStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [botSendStatus]);
  useEffect(() => {
    const handleFocus = () => {
      if (!waitingForBotRef.current) return;
      waitingForBotRef.current = false;
      const workflowId = botWorkflowIdRef.current;
      if (!workflowId) return;
      void onSystemBotReturn?.(workflowId, [
        ...new Set(placements.map((placement) => placement.channelId)),
      ])
        .then((importedDraft) => {
          if (!importedDraft) {
            waitingForBotRef.current = true;
            return;
          }
          botWorkflowIdRef.current = "";
          setExpanded(true);
          setPlacements((current) =>
            current.map((placement) => ({
              ...placement,
              managedPostDraft: importedDraft,
              telegramPostId: null,
            })),
          );
        })
        .catch(() => {
          waitingForBotRef.current = true;
          setBotOpenError("Could not load the post from Telegram. Try again.");
        });
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [onSystemBotReturn, placements, setPlacements]);
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
            draftHasContent && draft && onSendSystemBotPost ? (
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-xs"
                disabled={previewSendStatus !== "idle"}
                aria-label={
                  previewSendStatus === "sending"
                    ? "Sending post to bot"
                    : previewSendStatus === "sent"
                      ? "Current post sent to bot"
                      : "Send current post to bot"
                }
                onClick={() => {
                  setBotOpenError("");
                  setPreviewSendStatus("sending");
                  void onSendSystemBotPost(draft)
                    .then(() => setPreviewSendStatus("sent"))
                    .catch(() => {
                      setPreviewSendStatus("idle");
                      setBotOpenError(
                        "Could not send the post to the bot. Try again.",
                      );
                    });
                }}
              >
                {previewSendStatus === "sending"
                  ? "Sending..."
                  : previewSendStatus === "sent"
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
              disabled={botSendStatus !== "idle"}
              aria-label={
                botSendStatus === "sending"
                  ? "Sending to bot"
                  : botSendStatus === "sent"
                    ? "Sent to bot"
                    : "Add new post from bot"
              }
              onClick={() => {
                setBotOpenError("");
                setBotSendingDots(1);
                setBotSendStatus("sending");
                void (onPrepareSystemBot?.() ?? Promise.resolve())
                  .then((workflowId) => {
                    if (!workflowId)
                      throw new Error("Post import was not prepared");
                    botWorkflowIdRef.current = workflowId;
                    waitingForBotRef.current = true;
                    setBotSendStatus("sent");
                  })
                  .catch(() => {
                    waitingForBotRef.current = false;
                    setBotSendStatus("idle");
                    setBotOpenError(
                      "Could not prepare the bot workspace. Try again.",
                    );
                  });
              }}
            >
              {botSendStatus === "sending" ? (
                <span className="inline-flex min-w-[4.5rem] items-center justify-center gap-1">
                  Sending{".".repeat(botSendingDots)}
                </span>
              ) : botSendStatus === "sent" ? (
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
      {botOpenError ? (
        <p className="mt-2 text-xs text-rose-300">{botOpenError}</p>
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

"use client";

import { Bot, ChevronDown, Pencil, Send, UsersRound } from "lucide-react";
import { useState } from "react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { MutualPromotionPostComposer } from "./mutual-promotion/mutual-promotion-post-composer";

type FlowStatus = "idle" | "working" | "waiting" | "done";

export function CrossPromotionPublicationPostEditor({
  directMutual,
  post,
  publishingChannel,
  botConnected,
  importStatus,
  sendStatus,
  onImport,
  onSend,
  onUseSelectedPromo,
  onChange,
}: {
  directMutual: boolean;
  post: TelegramSystemBotPostDraft;
  publishingChannel?: TelegramChannel;
  botConnected: boolean;
  importStatus: FlowStatus;
  sendStatus: FlowStatus;
  onImport: () => void;
  onSend: () => void;
  onUseSelectedPromo: () => void;
  onChange: (post: TelegramSystemBotPostDraft) => void;
}) {
  const hasPost = Boolean(
    post.text.trim() || post.imageUrls.length || post.mediaItems?.length,
  );
  const [opened, setOpened] = useState(!directMutual);
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const expanded = !directMutual || (!manuallyCollapsed && (opened || hasPost));

  return (
    <section className="rounded-xl border border-neutral-800 p-3">
      <div
        className={`${expanded ? "mb-3" : ""} flex flex-wrap items-center justify-between gap-2`}
      >
        <div>
          <h3 className="font-semibold text-white">
            {directMutual
              ? "Partner post I publish"
              : "Post published in my channels"}
          </h3>
          <p className="text-xs text-neutral-400">
            {directMutual
              ? "Forward the partner's advertising post through the bot or compose it manually."
              : "Load the selected promo, then adjust this placement copy if needed."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {directMutual ? (
            <>
              {!expanded ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setManuallyCollapsed(false);
                    setOpened(true);
                  }}
                >
                  <Pencil size={15} /> Write manually
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !botConnected ||
                  importStatus === "working" ||
                  importStatus === "waiting"
                }
                onClick={() => {
                  setManuallyCollapsed(false);
                  setOpened(true);
                  onImport();
                }}
              >
                <Bot size={15} />{" "}
                {importStatus === "working"
                  ? "Loading…"
                  : importStatus === "waiting"
                    ? "Waiting for bot…"
                    : importStatus === "done"
                      ? "✅ Imported from bot"
                      : "Import through bot"}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={onUseSelectedPromo}
            >
              <UsersRound size={15} /> Use selected promo
            </Button>
          )}
          {expanded ? (
            <Button
              type="button"
              variant="secondary"
              disabled={!botConnected || sendStatus === "working" || !hasPost}
              onClick={onSend}
            >
              <Send size={15} />{" "}
              {sendStatus === "working"
                ? "Sending…"
                : sendStatus === "done"
                  ? "✅ Sent to bot"
                  : "Send preview to bot"}
            </Button>
          ) : null}
          {directMutual && expanded ? (
            <button
              type="button"
              aria-label="Collapse partner post editor"
              className="rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              onClick={() => setManuallyCollapsed(true)}
            >
              <ChevronDown size={17} className="rotate-180" />
            </button>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <MutualPromotionPostComposer
          draft={post}
          channelTitle={publishingChannel?.title ?? "Publishing channel"}
          channelPhotoUrl={publishingChannel?.photoUrl}
          channelId={publishingChannel?.id}
          onChange={onChange}
        />
      ) : null}
    </section>
  );
}

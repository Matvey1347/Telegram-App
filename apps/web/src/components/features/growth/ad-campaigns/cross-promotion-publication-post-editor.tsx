"use client";

import { Bot, ChevronDown, Pencil, Send, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { MutualPromotionPostComposer } from "./mutual-promotion/mutual-promotion-post-composer";

type FlowStatus = "idle" | "working" | "waiting" | "done";

export function CrossPromotionPublicationPostEditor({
  title,
  directMutual,
  post,
  publishingChannel,
  botConnected,
  importStatus,
  sendStatus,
  dots = 1,
  onImport,
  onSend,
  onUseSelectedPromo,
  onChange,
  onClear,
  publishedMediaCount,
}: {
  title?: string;
  directMutual: boolean;
  post: TelegramSystemBotPostDraft;
  publishingChannel?: TelegramChannel;
  botConnected: boolean;
  importStatus: FlowStatus;
  sendStatus: FlowStatus;
  dots?: number;
  onImport: () => void;
  onSend: () => void;
  onUseSelectedPromo: () => void;
  onChange: (post: TelegramSystemBotPostDraft) => void;
  onClear?: () => void;
  publishedMediaCount?: number;
}) {
  const hasPost = Boolean(
    post.text.trim() || post.imageUrls.length || post.mediaItems?.length,
  );
  const [opened, setOpened] = useState(!directMutual);
  const [manuallyCollapsed, setManuallyCollapsed] = useState(false);
  const expanded = !directMutual || (!manuallyCollapsed && (opened || hasPost));

  return (
    <section className="border-y border-neutral-800 py-3 sm:rounded-xl sm:border sm:p-3">
      <div
        className={`${expanded ? "mb-3" : ""} flex flex-wrap items-center justify-between gap-2`}
      >
        <div>
          <h3 className="font-semibold text-white">
            {title ?? (directMutual
              ? "Partner post I publish"
              : "Post published in my channels")}
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setManuallyCollapsed(false);
                  setOpened(true);
                }}
              >
                <Pencil size={15} /> {hasPost ? "Update post" : "Write manually"}
              </Button>
              {onClear && hasPost ? (
                <Button type="button" variant="danger" onClick={onClear}>
                  <Trash2 size={15} /> Clear post
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
                  ? `Loading${".".repeat(dots)}`
                  : importStatus === "waiting"
                    ? `Waiting for bot${".".repeat(dots)}`
                    : importStatus === "done"
                      ? "✅ Imported from bot"
                      : "Import through bot"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={
                  !botConnected ||
                  importStatus === "working" ||
                  importStatus === "waiting"
                }
                onClick={onImport}
              >
                <Bot size={15} />{" "}
                {importStatus === "working"
                  ? `Loading${".".repeat(dots)}`
                  : importStatus === "waiting"
                    ? `Waiting for bot${".".repeat(dots)}`
                    : importStatus === "done"
                      ? "✅ Imported from bot"
                      : "Import through bot"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onUseSelectedPromo}
              >
                <UsersRound size={15} /> Use selected promo
              </Button>
            </>
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
          mediaMaxItems={publishedMediaCount}
          mediaNotice={
            publishedMediaCount === undefined
              ? undefined
              : "Replace existing photos only. Keep the same number of photos; video and GIF media cannot be changed after sending or scheduling."
          }
          onChange={onChange}
        />
      ) : null}
    </section>
  );
}

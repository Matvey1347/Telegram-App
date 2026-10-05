"use client";

import { useState } from "react";
import type { TelegramAdSale } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import {
  PlacementPostComposer,
  type PlacementManagedPostDraft,
} from "./placement-post/placement-post-composer";
import { hasPlacementPostContent } from "./placement-post/placement-post-content";

export function AdSaleSharedPostEditor({
  sale,
  channelTitle,
  channelPhotoUrl,
  onSave,
  onRecreateViaBot,
}: {
  sale: TelegramAdSale;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  onSave: (draft: PlacementManagedPostDraft) => Promise<void>;
  onRecreateViaBot?: () => Promise<void>;
}) {
  const source = sale.placements.find(
    (placement) => placement.managedPost,
  )?.managedPost;
  const hasMtprotoPost = sale.placements.some(
    (placement) => placement.managedPost?.sourceType === "MTPROTO",
  );
  const [draft, setDraft] = useState<PlacementManagedPostDraft>(() => ({
    title: source?.title ?? "Advertising post",
    text: source?.text ?? "",
    imageUrls: source?.imageUrls ?? [],
    mediaItems: source?.mediaItems,
    buttonRows: source?.buttonRows ?? [],
  }));
  const [saving, setSaving] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [error, setError] = useState("");
  const botFlow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey: `ad-sale-shared-post-${sale.id}`,
    importContext: "Shared ad sale post",
    previewDraft: draft,
    errorCopy: {
      preview: "Could not send the shared post to the System Bot.",
    },
  });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the shared post.",
      );
    } finally {
      setSaving(false);
    }
  };


  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-4">
        <h4 className="font-semibold text-white">Shared advertising post</h4>
        <p className="mt-1 text-sm text-neutral-400">
          One save updates the existing post in all {sale.placements.length}{" "}
          channels. No post is detached, deleted, or recreated.
        </p>
      </div>
      <PlacementPostComposer
        channelTitle={channelTitle}
        channelPhotoUrl={channelPhotoUrl}
        draft={draft}
        publishedPosts={[]}
        postsLoading={false}
        canCreate
        autoCreate={false}
        lockToDraft
        allowInlineButtonEditing={!hasMtprotoPost}
        onLoadPublishedPosts={() => undefined}
        onChange={(next) => {
          if (next.draft) setDraft(next.draft);
        }}
      />
      {hasMtprotoPost ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
          <span>
            Inline buttons require Bot API. Recreate the scheduled posts through
            the bot to enable button editing in every channel.
          </span>
          <Button
            variant="secondary"
            disabled={recreating || saving || !onRecreateViaBot}
            onClick={async () => {
              if (!onRecreateViaBot) return;
              setRecreating(true);
              setError("");
              try {
                await onRecreateViaBot();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Could not recreate posts through the bot.",
                );
              } finally {
                setRecreating(false);
              }
            }}
          >
            {recreating ? "Recreating via bot…" : "Recreate via bot"}
          </Button>
        </div>
      ) : null}
      {error || botFlow.error ? <p className="text-sm text-rose-300">{error || botFlow.error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-4">
        <Button
          type="button"
          variant="secondary"
          disabled={saving || botFlow.sendStatus === "working" || !hasPlacementPostContent(draft)}
          onClick={() => void botFlow.send(draft)}
        >
          {botFlow.sendStatus === "working"
            ? "Sending…"
            : botFlow.sendStatus === "done"
              ? "✅ Sent to bot"
              : "Send post to bot"}
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || !draft.title.trim()}
        >
          {saving ? "Updating all channels…" : "Update in all channels"}
        </Button>
      </div>
    </div>
  );
}

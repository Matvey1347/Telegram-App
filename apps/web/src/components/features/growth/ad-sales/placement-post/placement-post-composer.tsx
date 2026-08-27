"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramPostButtonRows } from "@telegram-system/shared";
import { TelegramImageUpload } from "@/components/features/telegram/telegram/telegram-image-upload";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { FormField, Input, Select, Tooltip } from "@/components/ui/primitives";

export type PlacementManagedPostDraft = {
  title: string;
  text: string;
  imageUrls: string[];
  buttonRows: TelegramPostButtonRows;
};

type PublishedPostOption = { id: string; title: string; publishedAt: string };

export function PlacementPostComposer({
  channelTitle,
  channelPhotoUrl,
  draft,
  existingPostId,
  publishedPosts,
  postsLoading,
  canCreate,
  autoCreate,
  lockToDraft = false,
  allowInlineButtonEditing = true,
  onLoadPublishedPosts,
  onChange,
}: {
  channelTitle: string;
  channelPhotoUrl?: string | null;
  draft?: PlacementManagedPostDraft | null;
  existingPostId?: string | null;
  publishedPosts: PublishedPostOption[];
  postsLoading: boolean;
  canCreate: boolean;
  autoCreate: boolean;
  lockToDraft?: boolean;
  allowInlineButtonEditing?: boolean;
  onLoadPublishedPosts: (
    telegramPostUrl?: string,
  ) => Promise<PublishedPostOption | null> | void;
  onChange: (next: {
    draft?: PlacementManagedPostDraft | null;
    telegramPostId?: string | null;
    publishedAt?: string;
  }) => void;
}) {
  const autoCreatedForFutureRef = useRef(false);
  const [existingInputMode, setExistingInputMode] = useState<"select" | "link">(
    "select",
  );
  const [postUrl, setPostUrl] = useState("");
  const updateDraft = (patch: Partial<PlacementManagedPostDraft>) => {
    const current = draft ?? {
      title: "Advertising post",
      text: "",
      imageUrls: [],
      buttonRows: [],
    };
    onChange({ draft: { ...current, ...patch }, telegramPostId: null });
  };

  useEffect(() => {
    if (!autoCreate) {
      autoCreatedForFutureRef.current = false;
      return;
    }
    if (autoCreatedForFutureRef.current || draft) return;
    autoCreatedForFutureRef.current = true;
    onChange({
      draft: {
        title: "Advertising post",
        text: "",
        imageUrls: [],
        buttonRows: [],
      },
      telegramPostId: null,
    });
  }, [autoCreate, draft, onChange]);

  return (
    <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-white">Advertising post</p>
        {!lockToDraft && canCreate ? (
          <Tooltip
            side="top"
            align="left"
            content="Turn on to create a post from scratch. Turn off to select an existing published post."
          >
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(draft)}
              aria-label="Create advertising post from scratch"
              disabled={!canCreate && !draft}
              onClick={() => {
                if (draft) {
                  onChange({ draft: null, telegramPostId: null });
                  onLoadPublishedPosts();
                  return;
                }
                updateDraft({});
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-default disabled:opacity-70 ${
                draft
                  ? "border-blue-500/70 bg-blue-500/30"
                  : "border-neutral-700 bg-neutral-900"
              }`}
            >
              <span
                className={`absolute h-3.5 w-3.5 rounded-full bg-white transition ${draft ? "left-[17px]" : "left-1"}`}
              />
            </button>
          </Tooltip>
        ) : lockToDraft ? (
          <span className="text-xs text-neutral-500">Channel post</span>
        ) : null}
      </div>

      {draft ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1fr)]">
          <TelegramPostPreview
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            text={draft.text}
            imageUrls={draft.imageUrls}
            buttonRows={draft.buttonRows}
          />
          <div className="space-y-3">
            <FormField label="Title" required>
              <Input
                value={draft.title}
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            </FormField>
            <FormField label="Text">
              <TelegramTextEditor
                value={draft.text}
                onChange={(text) => updateDraft({ text })}
                buttonRows={draft.buttonRows}
                onButtonRowsChange={
                  allowInlineButtonEditing
                    ? (buttonRows) => updateDraft({ buttonRows })
                    : undefined
                }
              />
            </FormField>
            <TelegramImageUpload
              value={draft.imageUrls}
              onChange={(imageUrls) => updateDraft({ imageUrls })}
              compact
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {!canCreate ? (
            <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5">
              {(["select", "link"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={existingInputMode === mode}
                  onClick={() => setExistingInputMode(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ${existingInputMode === mode ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}
                >
                  {mode === "select" ? "Select post" : "Paste link"}
                </button>
              ))}
            </div>
          ) : null}
          {existingInputMode === "select" || canCreate ? (
            <Select
              value={existingPostId ?? ""}
              onFocus={() => void onLoadPublishedPosts()}
              searchPlaceholder="Search posts or paste a Telegram link"
              onSearchPaste={async (value) => {
                if (!/^https?:\/\/(?:www\.)?t\.me\//i.test(value)) return false;
                const post = await onLoadPublishedPosts(value);
                if (!post) return false;
                onChange({
                  telegramPostId: post.id,
                  publishedAt: post.publishedAt,
                  draft: null,
                });
                return true;
              }}
              onChange={(event) => {
                const post = publishedPosts.find(
                  (candidate) => candidate.id === event.target.value,
                );
                onChange({
                  telegramPostId: event.target.value || null,
                  publishedAt: post?.publishedAt,
                  draft: null,
                });
              }}
            >
              <option value="">Select a published post</option>
              {postsLoading ? (
                <option value="__loading" disabled>
                  Loading posts...
                </option>
              ) : null}
              {publishedPosts.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.title}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex gap-2">
              <Input
                value={postUrl}
                onChange={(event) => setPostUrl(event.target.value)}
                placeholder="https://t.me/channel/123"
                aria-label="Telegram post link"
              />
              <button
                type="button"
                disabled={postsLoading || !postUrl.trim()}
                onClick={async () => {
                  const post = await onLoadPublishedPosts(postUrl.trim());
                  if (!post) return;
                  onChange({
                    telegramPostId: post.id,
                    publishedAt: post.publishedAt,
                    draft: null,
                  });
                }}
                className="rounded-md bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Use link
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

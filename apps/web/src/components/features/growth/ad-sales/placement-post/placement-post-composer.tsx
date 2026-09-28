"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, Smile } from "lucide-react";
import {
  type TelegramPostButtonRows,
  type TelegramPostMediaItem,
} from "@telegram-system/shared";
import { TelegramPostDraftEditor } from "@/components/features/telegram/telegram/telegram-post-draft-editor";
import { Input, Select, Tooltip } from "@/components/ui/primitives";
import type { PublishedPostOption } from "../ad-sale-types";

export type PlacementManagedPostDraft = {
  title: string;
  text: string;
  imageUrls: string[];
  mediaItems?: TelegramPostMediaItem[];
  buttonRows: TelegramPostButtonRows;
};

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
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const linkedPost = publishedPosts.find((post) => post.id === existingPostId);
  const linkPost = async (url: string) => {
    setLinkLoading(true);
    setLinkError("");
    try {
      const post = await onLoadPublishedPosts(url);
      if (!post) {
        setLinkError("The post was not found in this channel.");
        return null;
      }
      onChange({
        telegramPostId: post.id,
        publishedAt: post.publishedAt,
        draft: null,
      });
      return post;
    } catch {
      setLinkError("Could not load the Telegram post. Try again.");
      return null;
    } finally {
      setLinkLoading(false);
    }
  };
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
        <TelegramPostDraftEditor
          draft={draft}
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          textPlaceholder="Write your Telegram post…"
          buttonEditing={allowInlineButtonEditing ? "enabled" : "disabled"}
          onChange={(nextDraft) =>
            onChange({ draft: nextDraft, telegramPostId: null })
          }
        />
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
                return Boolean(await linkPost(value));
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
                disabled={postsLoading || linkLoading || !postUrl.trim()}
                onClick={() => void linkPost(postUrl.trim())}
                className="rounded-md bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {linkLoading ? "Loading..." : "Use link"}
              </button>
            </div>
          )}
          {linkError ? <p className="text-xs text-rose-300">{linkError}</p> : null}
          {linkedPost ? (
            <div className="rounded-md border border-emerald-800/70 bg-emerald-950/20 px-3 py-2 text-xs text-neutral-300">
              <p className="font-medium text-emerald-200">Post linked</p>
              {linkedPost.telegramPostUrl ? (
                <a
                  href={linkedPost.telegramPostUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-sky-300 hover:text-sky-200 hover:underline"
                >
                  <span>{linkedPost.telegramPostUrl}</span>
                  <ExternalLink size={12} className="shrink-0" />
                </a>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-neutral-400">
                <span className="inline-flex items-center gap-1">
                  <Eye size={13} aria-hidden="true" />
                  {Number(linkedPost.viewsCount ?? 0).toLocaleString()} views
                </span>
                <span className="inline-flex items-center gap-1">
                  <Smile size={13} aria-hidden="true" />
                  {Number(linkedPost.reactionsCount ?? 0).toLocaleString()} reactions
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

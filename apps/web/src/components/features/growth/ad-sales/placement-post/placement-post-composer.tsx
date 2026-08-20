"use client";

import { useEffect, useRef } from "react";
import type { TelegramPostButtonRows } from "@telegram-system/shared";
import { TelegramImageUpload } from "@/components/features/telegram/telegram/telegram-image-upload";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { Button, FormField, Input, Select, ToggleRow } from "@/components/ui/primitives";

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
  onLoadPublishedPosts: () => void;
  onChange: (next: { draft?: PlacementManagedPostDraft | null; telegramPostId?: string | null; publishedAt?: string }) => void;
}) {
  const autoCreatedForFutureRef = useRef(false);
  const updateDraft = (patch: Partial<PlacementManagedPostDraft>) => {
    const current = draft ?? { title: "Advertising post", text: "", imageUrls: [], buttonRows: [] };
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
      draft: { title: "Advertising post", text: "", imageUrls: [], buttonRows: [] },
      telegramPostId: null,
    });
  }, [autoCreate, draft, onChange]);

  return (
    <FormField label="Advertising post">
      <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
        <ToggleRow
          checked={Boolean(draft)}
          disabled={!canCreate && !draft}
          onChange={(checked) => {
            if (checked) {
              updateDraft({});
              return;
            }
            onChange({ draft: null, telegramPostId: null });
            onLoadPublishedPosts();
          }}
          label="Custom advertising post"
          description="Turn on to prepare a new post; turn off to attach an existing published post."
        />

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
                <Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} />
              </FormField>
              <FormField label="Text">
                <TelegramTextEditor
                  value={draft.text}
                  onChange={(text) => updateDraft({ text })}
                  buttonRows={draft.buttonRows}
                  onButtonRowsChange={(buttonRows) => updateDraft({ buttonRows })}
                />
              </FormField>
              <TelegramImageUpload value={draft.imageUrls} onChange={(imageUrls) => updateDraft({ imageUrls })} compact />
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Select value={existingPostId ?? ""} onFocus={onLoadPublishedPosts} onChange={(event) => onChange({ telegramPostId: event.target.value || null, draft: null })}>
              <option value="">Select a published post</option>
              {postsLoading ? <option value="__loading" disabled>Loading posts...</option> : null}
              {publishedPosts.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}
            </Select>
            {!publishedPosts.length && !postsLoading ? <Button type="button" variant="secondary" onClick={onLoadPublishedPosts}>Load published posts</Button> : null}
            {!existingPostId ? publishedPosts.map((post) => <button key={post.id} type="button" className="block text-left text-sm text-blue-300 hover:text-blue-200" onClick={() => onChange({ telegramPostId: post.id, publishedAt: post.publishedAt, draft: null })}>{post.title}</button>) : null}
          </div>
        )}
      </div>
    </FormField>
  );
}

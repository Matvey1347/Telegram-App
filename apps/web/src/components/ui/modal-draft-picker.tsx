"use client";

import { Plus } from "lucide-react";
import type {
  WorkspaceDraftAvatar,
  WorkspaceFormDraft,
} from "@/lib/workspace-modal-drafts";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button, Card, IconButton } from "./primitives";

const MAX_AVATARS = 3;

function DraftAvatars({ avatars }: { avatars?: WorkspaceDraftAvatar[] }) {
  if (!avatars?.length) return null;
  const visible = avatars.slice(0, MAX_AVATARS);
  return (
    <div
      className="flex shrink-0 -space-x-1"
      aria-label={`${avatars.length} channels selected`}
    >
      {visible.map((avatar, index) => (
        <IconAvatar
          key={`${avatar.label}:${index}`}
          icon={
            avatar.icon ??
            (avatar.imageUrl
              ? {
                  type: "image",
                  id: avatar.imageUrl,
                  url: avatar.imageUrl,
                  name: avatar.label,
                }
              : null)
          }
          label={avatar.label}
          size="sm"
          decorative
          className="ring-2 ring-neutral-950"
        />
      ))}
      {avatars.length > MAX_AVATARS ? (
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-neutral-800 px-1 text-xs text-neutral-300 ring-2 ring-neutral-950">
          +{avatars.length - MAX_AVATARS}
        </span>
      ) : null}
    </div>
  );
}

export function ModalDraftPicker<T>({
  drafts,
  titleFor,
  onContinue,
  onDelete,
  onCreateNew,
  createDisabled = false,
}: {
  drafts: WorkspaceFormDraft<T>[];
  titleFor?: (form: T) => string;
  onContinue: (draft: WorkspaceFormDraft<T>) => void;
  onDelete: (draft: WorkspaceFormDraft<T>) => void;
  onCreateNew: () => void;
  createDisabled?: boolean;
}) {
  if (!drafts.length) return null;
  return (
    <Card className="space-y-3 border-blue-900/60 bg-blue-950/10">
      <div>
        <p className="font-medium text-white">Saved drafts</p>
        <p className="text-xs text-slate-400">
          Continue, delete, or start with a clean form.
        </p>
      </div>
      <div className="space-y-2">
        {drafts.map((draft) => {
          const title =
            draft.preview?.title ?? titleFor?.(draft.form) ?? "Untitled draft";
          return (
            <div
              key={draft.id}
              className="grid min-w-0 gap-3 rounded-lg border border-slate-800 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {draft.preview?.icon ? (
                  <IconAvatar
                    icon={draft.preview.icon}
                    label={title}
                    size="sm"
                    decorative
                  />
                ) : null}
                <DraftAvatars avatars={draft.preview?.avatars} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {title}
                  </p>
                  {draft.preview?.subtitle ? (
                    <p className="truncate text-xs text-slate-400">
                      {draft.preview.subtitle}
                    </p>
                  ) : null}
                  {draft.preview?.detail || draft.preview?.badge ? (
                    <p className="text-xs text-slate-500">
                      {draft.preview.detail}
                      {draft.preview.detail && draft.preview.badge ? " · " : ""}
                      {draft.preview.badge}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Saved {new Date(draft.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <IconButton
                  type="button"
                  kind="delete"
                  aria-label={`Delete draft ${title}`}
                  title="Delete draft"
                  onClick={() => onDelete(draft)}
                />
                <IconButton
                  type="button"
                  aria-label={`Continue draft ${title}`}
                  title="Continue draft"
                  onClick={() => onContinue(draft)}
                />
              </div>
            </div>
          );
        })}
      </div>
      <Button type="button" disabled={createDisabled} onClick={onCreateNew}>
        <Plus size={15} /> Create new
      </Button>
    </Card>
  );
}

"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { WorkspaceFormDraft } from "@/hooks/use-workspace-modal-drafts";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { iconsApi } from "@/lib/api";
import { iconToResolvedEmoji } from "@/lib/resolved-emoji";
import { Button, Card, IconButton } from "./primitives";

function defaultIconIdFor<T>(form: T) {
  if (!form || typeof form !== "object" || !("iconId" in form)) return null;
  const iconId = (form as { iconId?: unknown }).iconId;
  return typeof iconId === "string" && iconId ? iconId : null;
}

export function ModalDraftPicker<T>({
  drafts,
  titleFor,
  iconIdFor,
  onContinue,
  onDelete,
  onCreateNew,
}: {
  drafts: WorkspaceFormDraft<T>[];
  titleFor: (form: T) => string;
  iconIdFor?: (form: T) => string | null | undefined;
  onContinue: (draft: WorkspaceFormDraft<T>) => void;
  onDelete: (draft: WorkspaceFormDraft<T>) => void;
  onCreateNew: () => void;
}) {
  const missingIconIds = useMemo(
    () =>
      new Set(
        drafts.flatMap((draft) => {
          const iconId = iconIdFor
            ? iconIdFor(draft.form)
            : defaultIconIdFor(draft.form);
          return !draft.preview?.icon && iconId ? [iconId] : [];
        }),
      ),
    [drafts, iconIdFor],
  );
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
        {missingIconIds.size ? (
          <LegacyDraftRows
            drafts={drafts}
            titleFor={titleFor}
            iconIdFor={iconIdFor}
            missingIconIds={missingIconIds}
            onContinue={onContinue}
            onDelete={onDelete}
          />
        ) : (
          <DraftRows
            drafts={drafts}
            titleFor={titleFor}
            iconIdFor={iconIdFor}
            fallbackIcons={new Map()}
            onContinue={onContinue}
            onDelete={onDelete}
          />
        )}
      </div>
      <Button type="button" onClick={onCreateNew}>
        <Plus size={15} /> Create new
      </Button>
    </Card>
  );
}

function LegacyDraftRows<T>({
  missingIconIds,
  ...props
}: Omit<Parameters<typeof DraftRows<T>>[0], "fallbackIcons"> & {
  missingIconIds: Set<string>;
}) {
  const iconsQuery = useQuery({
    queryKey: ["icons", ""],
    queryFn: () => iconsApi.list(),
    staleTime: 60_000,
  });
  const fallbackIcons = new Map(
    (iconsQuery.data ?? [])
      .filter((icon) => missingIconIds.has(icon.id))
      .map((icon) => [icon.id, iconToResolvedEmoji(icon)]),
  );
  return <DraftRows {...props} fallbackIcons={fallbackIcons} />;
}

function DraftRows<T>({
  drafts,
  titleFor,
  iconIdFor,
  fallbackIcons,
  onContinue,
  onDelete,
}: {
  drafts: WorkspaceFormDraft<T>[];
  titleFor: (form: T) => string;
  iconIdFor?: (form: T) => string | null | undefined;
  fallbackIcons: Map<string, ReturnType<typeof iconToResolvedEmoji>>;
  onContinue: (draft: WorkspaceFormDraft<T>) => void;
  onDelete: (draft: WorkspaceFormDraft<T>) => void;
}) {
  return drafts.map((draft) => {
    const iconId = iconIdFor
      ? iconIdFor(draft.form)
      : defaultIconIdFor(draft.form);
    const draftIcon =
      draft.preview?.icon ?? (iconId ? fallbackIcons.get(iconId) : null);
    const title = titleFor(draft.form);
    return (
      <div
        key={draft.id}
        className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {draftIcon ? (
            <IconAvatar icon={draftIcon} label={title} size="sm" decorative />
          ) : null}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">
              {title || "Untitled draft"}
            </p>
            <p className="text-xs text-slate-500">
              {draft.createdAt
                ? new Date(draft.createdAt).toLocaleString()
                : "Saved automatically"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <IconButton
            type="button"
            kind="delete"
            aria-label={`Delete draft ${title || "Untitled"}`}
            title="Delete draft"
            onClick={() => onDelete(draft)}
          />
          <IconButton
            type="button"
            aria-label={`Continue draft ${title || "Untitled"}`}
            title="Continue draft"
            onClick={() => onContinue(draft)}
          />
        </div>
      </div>
    );
  });
}

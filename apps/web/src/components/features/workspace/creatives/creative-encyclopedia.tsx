"use client";

import { BookOpen, Lightbulb, Plus, SquarePen, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import {
  creativeSections,
  type CreativeSection,
  type WorkspaceCreative,
} from "@telegram-system/shared";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CreativeCard } from "./creative-card";
import { CreativeCopyButton } from "./creative-copy-button";
import { CreativeEditor } from "./creative-editor";
import type { CreativeLabels } from "./creative-labels";
import { useCreativeEncyclopedia } from "./use-creative-encyclopedia";

export function CreativeEncyclopedia({
  workspaceId,
  linkedId,
  labels,
  onClose,
  onBack,
  onOpenWorkspace,
}: {
  workspaceId: string | null;
  linkedId: string | null;
  labels: CreativeLabels;
  onClose: () => void;
  onOpenWorkspace?: () => Promise<void>;
  onBack: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);

  async function openWorkspace() {
    setSwitching(true);
    setSwitchFailed(false);
    try {
      await onOpenWorkspace?.();
    } catch {
      setSwitchFailed(true);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Modal
      open
      title={labels.title}
      size="xl"
      titleIcon={<BookOpen size={19} aria-hidden="true" />}
      onClose={onClose}
    >
      {workspaceId ? (
        <CreativeLibrary
          key={workspaceId}
          workspaceId={workspaceId}
          {...{ linkedId, labels, onBack }}
        />
      ) : (
        <div className="space-y-3">
          <EmptyState text={labels.differentWorkspace} />
          {onOpenWorkspace ? (
            <Button
              type="button"
              disabled={switching}
              onClick={() => void openWorkspace()}
            >
              {switching ? labels.loading : labels.switchWorkspace}
            </Button>
          ) : null}
          {switchFailed ? (
            <p role="alert" className="text-sm text-rose-300">
              {labels.switchError}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

const sectionIcons = {
  good: ThumbsUp, bad: ThumbsDown, attempt: SquarePen, mentor: Lightbulb,
} satisfies Record<CreativeSection, typeof BookOpen>;

function CreativeLibrary({
  workspaceId,
  linkedId,
  labels,
  onBack,
}: {
  workspaceId: string;
  linkedId: string | null;
  labels: CreativeLabels;
  onBack: () => void;
}) {
  const [section, setSection] = useState<CreativeSection>("good");
  const [adding, setAdding] = useState(false);
  const { list, detail, create, comment, remove } = useCreativeEncyclopedia(
    workspaceId,
    section,
    linkedId,
  );
  const query = linkedId ? detail : list;
  const entries = linkedId
    ? detail.data
      ? [detail.data]
      : []
    : (list.data?.pages.flatMap(({ items }) => items) ?? []);
  const renderCard = (entry: WorkspaceCreative) => (
    <CreativeCard
      key={entry.id}
      {...{ entry, workspaceId, labels }}
      onComment={(item, text) => comment.mutateAsync({ entry: item, text })}
      onDelete={async (item) => {
        await remove.mutateAsync(item);
        if (linkedId) onBack();
      }}
    />
  );

  return (
    <div className="space-y-4">
      {linkedId ? (
        <div className="flex flex-wrap items-start gap-2">
          <Button type="button" variant="secondary" onClick={onBack}>
            {labels.back}
          </Button>
          <CreativeCopyButton {...{ workspaceId, labels }} />
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-2 border-b border-neutral-800 pb-3">
          <div className="max-w-full overflow-x-auto">
            <SegmentedControl
              ariaLabel={labels.sectionsLabel}
              options={creativeSections.map((value) => {
                const Icon = sectionIcons[value];
                return { value, label: labels.sections[value], icon: <Icon size={13} aria-hidden="true" /> };
              })}
              value={section}
              onChange={(next) => {
                setSection(next);
                setAdding(false);
              }}
              disabled={adding}
            />
          </div>
          <CreativeCopyButton {...{ workspaceId, labels }} />
          {!adding ? (
            <Button
              type="button"
              className="sm:ml-auto"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" />
              {section === "mentor" ? labels.addAdvice : labels.add}
            </Button>
          ) : null}
        </div>
      )}
      {!linkedId && adding ? (
        <CreativeEditor
          {...{ section, labels, workspaceId }}
          pending={create.isPending}
          onCancel={() => setAdding(false)}
          onSave={async (input, file) => {
            await create.mutateAsync({ input, file });
          }}
        />
      ) : null}
      {query.isPending ? <LoadingState text={labels.loading} /> : null}
      {query.isError && !list.isFetchNextPageError ? (
        <div className="space-y-2" role="alert">
          <ErrorState text={labels.loadError} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void query.refetch()}
          >
            {labels.retry}
          </Button>
        </div>
      ) : null}
      {entries.map(renderCard)}
      {query.isSuccess && !entries.length ? (
        <EmptyState text={section === "mentor" ? labels.emptyAdvice : labels.empty} />
      ) : null}
      {!linkedId && list.hasNextPage ? (
        <div className="space-y-2">
          {list.isFetchNextPageError ? (
            <p role="alert" className="text-sm text-rose-300">
              {labels.loadError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={list.isFetching}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage
              ? labels.loading
              : list.isFetchNextPageError
                ? labels.retry
                : labels.more}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

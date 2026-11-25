"use client";

import { useState, type FormEvent } from "react";
import {
  normalizeTelegramPostMediaItems,
  type TelegramSystemBotPostDraft,
  creativeTargets,
  type CreateWorkspaceCreative,
  type CreativeSection,
  type CreativeTarget,
} from "@telegram-system/shared";
import { Button, Input, Textarea } from "@/components/ui/primitives";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { TelegramPostDraftEditor } from "@/components/features/telegram/telegram/telegram-post-draft-editor";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { telegramSystemBotApi } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";
import type { CreativeLabels } from "./creative-labels";

type CreativeForm = {
  target: CreativeTarget;
  post: TelegramSystemBotPostDraft;
  mentorComment: string;
};

function emptyCreative(): CreativeForm {
  return {
    target: "channel",
    post: { title: "", text: "", imageUrls: [], buttonRows: [] },
    mentorComment: "",
  };
}

function normalizeCreative(value: unknown): CreativeForm | null {
  const form = value as Partial<CreativeForm> | null;
  const post = form?.post;
  if (
    !post ||
    typeof post.title !== "string" ||
    typeof post.text !== "string" ||
    !Array.isArray(post.imageUrls) ||
    !Array.isArray(post.buttonRows) ||
    typeof form.mentorComment !== "string" ||
    !form.target ||
    !creativeTargets.includes(form.target)
  )
    return null;
  return { post, mentorComment: form.mentorComment, target: form.target };
}

function hasPostContent(post: TelegramSystemBotPostDraft) {
  return Boolean(
    post.text.trim() ||
    normalizeTelegramPostMediaItems(post.mediaItems, post.imageUrls).length,
  );
}

export function CreativeEditor({
  workspaceId,
  section,
  labels,
  pending,
  onSave,
  onCancel,
}: {
  workspaceId: string;
  section: CreativeSection;
  labels: CreativeLabels;
  pending: boolean;
  onSave: (input: CreateWorkspaceCreative, file: File | null) => Promise<void>;
  onCancel: () => void;
}) {
  const advice = section === "mentor";
  const [form, setForm] = useState(emptyCreative);
  const [error, setError] = useState("");
  const { target, post: draft, mentorComment } = form;
  const setDraft = (post: TelegramSystemBotPostDraft) =>
    setForm((current) => ({ ...current, post }));
  const drafts = useWorkspaceModalDrafts({
    namespace: `creative-encyclopedia:create:${section}`,
    workspaceId,
    schemaVersion: 1,
    open: true,
    enabled: true,
    value: form,
    createInitialValue: emptyCreative,
    normalize: normalizeCreative,
    onRestore: setForm,
    isMeaningful: ({ post, mentorComment, target }) =>
      Boolean(
        post.title.trim() ||
        mentorComment.trim() ||
        post.buttonRows.length ||
        hasPostContent(post) ||
        target !== "channel",
      ),
    previewFor: ({ post }) => ({ title: post.title.trim() || (advice ? labels.addAdvice : labels.add) }),
  });
  function back() {
    drafts.showDraftPicker();
    onCancel();
  }
  const connection = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    staleTime: 30_000,
    enabled: !advice,
  });
  const botUsername = connection.data?.connected
    ? connection.data.botUsername?.replace(/^@+/, "")
    : undefined;
  const bot = useTelegramSystemBotPostFlow({
    mode: "single",
    workspaceId,
    recoveryKey: `workspace-creative:${section}`,
    importContext: labels.title,
    botUsername,
    enabled: !advice && Boolean(botUsername) && drafts.pendingDrafts.length === 0,
    onImported: (imported) => {
      setForm((current) => ({
        ...current,
        post: {
          ...imported,
          title: current.post.title.trim() || imported.title.slice(0, 160),
        },
      }));
    },
  });

  const importing =
    bot.importStatus === "working" || bot.importStatus === "waiting";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const { title, ...post } = draft;
    if (!title.trim()) return setError(labels.requiredTitle);
    if (advice ? !post.text.trim() : !hasPostContent(draft))
      return setError(advice ? labels.requiredAdvice : labels.missingContent);
    setError("");
    try {
      await onSave(
        advice
          ? { section, title: title.trim(), text: post.text.trim() }
          : { section, target, title: title.trim(), post, mentorComment: mentorComment.trim() || undefined },
        null,
      );
      drafts.clearCurrentDraft();
      onCancel();
    } catch {
      setError(labels.saveError);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={back}
      >
        <ArrowLeft aria-hidden="true" />
        {labels.back}
      </Button>
      {drafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={drafts.pendingDrafts}
          onContinue={drafts.continueDraft}
          onDelete={drafts.deleteDraft}
          onCreateNew={drafts.createNewDraft}
        />
      ) : (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-lg border border-neutral-700 bg-neutral-950/40 p-3 sm:p-4"
        >
          <fieldset disabled={pending} className="min-w-0 space-y-3">
            <label className="block space-y-1 text-sm text-neutral-300">
              <span>{labels.entryTitle}</span>
              <Input
                name="title"
                required
                maxLength={160}
                value={draft.title}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            {advice ? (
              <label className="block space-y-1 text-sm text-neutral-300">
                <span>{labels.adviceText}</span>
                <Textarea required rows={5} maxLength={12000} value={draft.text}
                  onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
              </label>
            ) : <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
              <span aria-hidden="true">{labels.target}</span>
              <SegmentedControl
                ariaLabel={labels.target}
                value={target}
                onChange={(target) =>
                  setForm((current) => ({ ...current, target }))
                }
                options={creativeTargets.map((value) => ({
                  value,
                  label: labels.targets[value],
                }))}
              />
              <Button
                type="button"
                className="max-w-full !whitespace-normal"
                disabled={!botUsername || importing}
                onClick={() => void bot.startImport()}
              >
                <Send aria-hidden="true" />
                {importing ? labels.waitingForPost : labels.importPost}
              </Button>
            </div>
            {botUsername && bot.importStatus === "waiting" ? (
              <div className="flex flex-wrap items-center gap-3" role="status">
                <a
                  className="text-sm text-blue-300 underline"
                  href={`https://t.me/${encodeURIComponent(botUsername)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {labels.openBot}
                </a>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void bot.cancelImport()}
                >
                  {labels.cancelImport}
                </Button>
              </div>
            ) : null}
            {connection.data && !botUsername ? (
              <p className="text-sm text-neutral-400">{labels.connectBot}</p>
            ) : null}
            {bot.error ? (
              <p role="alert" className="text-sm text-rose-300">
                {bot.error}
              </p>
            ) : null}
            <TelegramPostDraftEditor
              draft={draft}
              channelTitle={draft.title || labels.entryTitle}
              titleField="hidden"
              disabled={pending}
              textPlaceholder={labels.entryText}
              onChange={setDraft}
            />
            <label className="block space-y-1 text-sm text-neutral-300">
              <span>{labels.comment}</span>
              <Textarea
                name="mentorComment"
                rows={2}
                maxLength={4000}
                value={mentorComment}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mentorComment: event.target.value,
                  }))
                }
              />
            </label>
            </>}
          </fieldset>
          {error ? (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={back}
            >
              {labels.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {advice ? labels.saveAdvice : labels.save}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

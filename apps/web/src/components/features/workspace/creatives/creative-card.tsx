"use client";

import { useId, useState, type FormEvent } from "react";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { Button, Textarea } from "@/components/ui/primitives";
import type { WorkspaceCreative } from "@telegram-system/shared";
import type { CreativeLabels } from "./creative-labels";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { CreativeMedia } from "./creative-media";

export function CreativeCard({
  entry,
  workspaceId,
  labels,
  onComment,
  onDelete,
}: {
  entry: WorkspaceCreative;
  workspaceId: string;
  labels: CreativeLabels;
  onComment: (entry: WorkspaceCreative, text: string) => Promise<unknown>;
  onDelete: (entry: WorkspaceCreative) => Promise<unknown>;
}) {
  const heading = useId();
  const [comment, setComment] = useState("");
  const [action, setAction] = useState<"comment" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function changeAction(next: typeof action) {
    setAction(next);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = comment.trim();
    if (!action || pending || (action === "comment" && !text)) return;
    setPending(true);
    setError("");
    try {
      if (action === "delete") await onDelete(entry);
      else {
        await onComment(entry, text);
        setComment("");
        setAction(null);
      }
    } catch {
      setError(action === "delete" ? labels.deleteError : labels.commentError);
    } finally {
      setPending(false);
    }
  }

  return (
    <article
      aria-labelledby={heading}
      className="min-w-0 space-y-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 sm:p-4"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4
            className="break-words font-semibold text-neutral-100"
            id={heading}
          >
            {entry.title}
          </h4>
          {entry.target ? <p className="text-xs text-neutral-400">{labels.targets[entry.target]}</p> : null}
        </div>
        <button
          type="button"
          aria-label={labels.delete}
          title={labels.delete}
          disabled={pending}
          className="rounded-md p-2 text-neutral-400 hover:bg-neutral-800 hover:text-rose-300 focus-visible:ring-2"
          onClick={() => changeAction(action === "delete" ? null : "delete")}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </header>
      {entry.post ? (
        <TelegramPostPreview
          channelTitle={entry.title}
          {...entry.post}
          compact
        />
      ) : entry.text ? (
        <p className="whitespace-pre-wrap break-words text-sm text-neutral-200">
          {entry.text}
        </p>
      ) : null}
      {entry.attachment ? (
        <CreativeMedia
          {...{ workspaceId, labels }}
          id={entry.id}
          attachment={entry.attachment}
        />
      ) : null}
      <section className="space-y-2 border-t border-neutral-800 pt-3">
        {entry.comments.length ? (
          <>
            <h5 className="text-sm font-medium text-neutral-300">
              {labels.comments}
            </h5>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300">
              {entry.comments.map((item) => (
                <li
                  key={item.id}
                  className="whitespace-pre-wrap break-words pl-1"
                >
                  {item.text}
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {!action ? (
          <Button
            type="button"
            variant="secondary"
            className="max-w-full !whitespace-normal text-left"
            onClick={() => changeAction("comment")}
          >
            <MessageSquarePlus aria-hidden="true" />
            {labels.addComment}
          </Button>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            {action === "comment" ? (
              <Textarea
                aria-label={labels.addComment}
                value={comment}
                rows={2}
                required
                maxLength={4000}
                disabled={pending}
                onChange={(event) => setComment(event.target.value)}
              />
            ) : (
              <p className="text-sm text-neutral-200">{labels.deleteConfirm}</p>
            )}
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => changeAction(null)}
              >
                {labels.cancel}
              </Button>
              <Button
                type="submit"
                variant={action === "delete" ? "danger" : "primary"}
                disabled={pending || (action === "comment" && !comment.trim())}
              >
                {action === "delete" ? labels.delete : labels.addComment}
              </Button>
            </div>
          </form>
        )}
      </section>
    </article>
  );
}

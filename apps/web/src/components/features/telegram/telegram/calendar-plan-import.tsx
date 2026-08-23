"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import {
  buildTelegramCalendarPlanInstructionFilename,
  type TelegramPostPlannerPreviewResult,
} from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { ManagedPostsImportSource } from "./managed-posts-import-source";
import { parseCalendarPlanImport } from "./calendar-plan-import-model";

type PlanPost = { id: string; title: string; groupId?: string | null };

export function CalendarPlanImport({
  channelId,
  channelTitle,
  posts,
  timezone,
  disabled,
  content,
  onContentChange,
  onPreview,
}: {
  channelId: string;
  channelTitle: string;
  posts: PlanPost[];
  timezone: string;
  disabled: boolean;
  content: string;
  onContentChange: (content: string) => void;
  onPreview: (preview: TelegramPostPlannerPreviewResult | null) => void;
}) {
  const { pushToast } = useAppToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [instructionLoading, setInstructionLoading] = useState(false);
  const onPreviewRef = useRef(onPreview);
  const lastPreviewInputRef = useRef<string | null>(null);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);
  const parsed = useMemo(() => {
    if (!content.trim()) return { preview: null, error: "" };
    try {
      return {
        preview: parseCalendarPlanImport(content, posts, timezone),
        error: "",
      };
    } catch (error) {
      return {
        preview: null,
        error: error instanceof Error ? error.message : "Could not parse plan.",
      };
    }
  }, [content, posts, timezone]);
  const error = fileError || parsed.error;
  const previewInputKey = JSON.stringify({
    content,
    error,
    posts: posts.map(({ id, title, groupId }) => ({ id, title, groupId })),
    timezone,
  });

  useEffect(() => {
    if (lastPreviewInputRef.current === previewInputKey) return;
    lastPreviewInputRef.current = previewInputKey;
    onPreviewRef.current(error ? null : parsed.preview);
  }, [error, parsed.preview, previewInputKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Import JSON plan</h3>
          <p className="mt-0.5 text-xs text-neutral-400">
            Upload or paste postId with scheduledAt, or date and time.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            The GPT instruction includes stable channel times, post texts,
            publishing blockers, occupied slots, and recent history.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || instructionLoading}
          onClick={async () => {
            setInstructionLoading(true);
            try {
              const blob =
                await telegramChannelsApi.calendarPlanInstruction(channelId);
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download =
                buildTelegramCalendarPlanInstructionFilename(channelTitle);
              document.body.appendChild(link);
              link.click();
              link.remove();
              URL.revokeObjectURL(url);
              pushToast("GPT planner instruction downloaded.", "success");
            } catch {
              pushToast("Could not download GPT planner instruction.", "error");
            } finally {
              setInstructionLoading(false);
            }
          }}
        >
          <Download size={15} />
          {instructionLoading
            ? "Preparing instruction…"
            : "Download GPT instruction"}
        </Button>
      </div>
      <ManagedPostsImportSource
        content={content}
        fileName={fileName}
        disabled={disabled}
        onContent={(value) => {
          onContentChange(value);
          setFileName(null);
          setFileError("");
        }}
        onFile={(file) => {
          void file
            .text()
            .then((value) => {
              onContentChange(value);
              setFileName(file.name);
              setFileError("");
            })
            .catch(() => setFileError("Could not read this file."));
        }}
        onClear={() => {
          onContentChange("");
          setFileName(null);
          setFileError("");
        }}
        onCopyContent={() => void navigator.clipboard.writeText(content)}
      />
      {error ? (
        <p className="rounded-lg border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import type { AiPostingWatermarkPreviewSettings } from "./ai-posting-watermark-preview";
import { useState } from "react";
import type {
  ResolvedEmoji,
  TelegramCustomEmojiPackSummary,
} from "@telegram-system/shared";
import { CheckCircle2, CircleX, Clock3, ImageOff, Loader2 } from "lucide-react";
import { Button, Card, StatusPill } from "@/components/ui/primitives";
import { AiPostingRunProgress } from "./ai-posting-run-progress";
import { AiPostingTestConsoleError } from "./ai-posting-test-console-error";
import {
  money,
  totalCost,
  type TestRun,
} from "./ai-posting-test-console-model";
import { AiPostingDictation } from "./ai-posting-dictation";
import { AiPostingFeedbackSuggestion } from "./ai-posting-feedback-suggestion";
import { AiPostingPublicationCarousel } from "./ai-posting-publication-carousel";

type ReviewAction =
  | "approve"
  | "reject"
  | "edit"
  | "save"
  | "regenerate-text"
  | "regenerate-image";
type ActionInput = {
  run: TestRun;
  index: number;
  action: ReviewAction;
  value?: string;
};

export function AiPostingTestRunCard({
  run,
  onStop,
  stopPending,
  channelId,
  channelTitle,
  channelPhotoUrl,
  watermarkPreview,
  customEmojiPacks,
  categoryIcons,
  preferenceIcons,
  edits,
  textFeedback,
  imageFeedback,
  ruleFeedback,
  suggestPending,
  confirmPending,
  retryPending,
  pendingAction,
  actionPending,
  isSaved,
  hasUnsavedText,
  onTextChange,
  onTextFeedbackChange,
  onImageFeedbackChange,
  onAction,
  onRegenerateFailure,
  onRememberImageRule,
  onRuleFeedbackChange,
  onSuggestRule,
  onConfirmSuggestion,
}: {
  run: TestRun;
  onStop?: () => void;
  stopPending?: boolean;
  channelId?: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  watermarkPreview?: AiPostingWatermarkPreviewSettings;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
  categoryIcons?: Record<string, ResolvedEmoji>;
  preferenceIcons?: Record<string, ResolvedEmoji>;
  edits: Record<string, string>;
  textFeedback: Record<string, string>;
  imageFeedback: Record<string, string>;
  ruleFeedback: string;
  suggestPending: boolean;
  confirmPending: boolean;
  retryPending: boolean;
  actionPending: boolean;
  pendingAction?: { runId: string; index: number; action: string };
  isSaved: Parameters<typeof AiPostingPublicationCarousel>[0]["isSaved"];
  hasUnsavedText: Parameters<
    typeof AiPostingPublicationCarousel
  >[0]["hasUnsavedText"];
  onTextChange: (key: string, value: string) => void;
  onTextFeedbackChange: (key: string, value: string) => void;
  onImageFeedbackChange: (key: string, value: string) => void;
  onAction: (input: ActionInput) => void;
  onRegenerateFailure: (run: TestRun, failureIndex: number) => void;
  onRememberImageRule?: (value: string) => Promise<void>;
  onRuleFeedbackChange: (value: string) => void;
  onSuggestRule: () => void;
  onConfirmSuggestion: (suggestionId: string) => void;
}) {
  const [editsOpen, setEditsOpen] = useState(false);
  const running = run.status === "RUNNING" || run.status === "SYNCING";
  const searchIncomplete = run.status === "PARTIAL" && run.failures.length > 0 &&
    run.failures.every(({ code }) => code === "AI_POSTING_IMAGE_SEARCH_EXHAUSTED");
  return (
    <Card className={running ? "space-y-4 border-blue-900! bg-blue-950/20!" : "space-y-4 bg-neutral-900/40"}>
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Clock3 size={15} />
          <strong>{new Date(run.createdAt).toLocaleString()}</strong>
        </div>
        {running ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950 px-2.5 py-0.5 text-xs font-medium text-blue-200">
            <Loader2 size={14} aria-hidden="true" className="motion-safe:animate-spin" />
            {run.status === "SYNCING" ? "Загружаю результат" : "В процессе"}
          </span>
        ) : run.status === "INTERRUPTED" ? (
          <span className="ml-auto rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs text-amber-200">
            Запуск прерван
          </span>
        ) : run.status === "CANCELED" ? (
          <StatusPill value="Остановлено" />
        ) : run.status.toUpperCase() === "COMPLETED" ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            <CheckCircle2 size={14} aria-hidden="true" />
            Completed
          </span>
        ) : searchIncomplete ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-300">
            <ImageOff size={14} aria-hidden="true" />
            Не все изображения найдены
          </span>
        ) : (
          ["FAILED", "PARTIAL"].includes(run.status.toUpperCase()) ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-rose-800 bg-rose-950 px-2.5 py-0.5 text-xs font-medium text-rose-300">
              <CircleX size={14} aria-hidden="true" />
              {run.status.toUpperCase() === "PARTIAL" ? "Partial" : "Failed"}
            </span>
          ) : (
            <StatusPill value={run.status.toLowerCase()} />
          )
        )}
      </header>

      {running && run.progress && <AiPostingRunProgress progress={run.progress} active />}
      {run.status === "FAILED" && run.failures.some(({ code }) => code === "AI_DISABLED") && (
        <AiPostingTestConsoleError code="AI_DISABLED" />
      )}
      {run.status === "RUNNING" && onStop && (
        <Button type="button" variant="secondary" disabled={stopPending} onClick={onStop}>
          {stopPending ? "Останавливаю…" : "Остановить"}
        </Button>
      )}
      {((!running && run.status !== "CANCELED") || run.publications.length > 0) && <AiPostingPublicationCarousel
        key={run.id}
        run={run}
        channelTitle={channelTitle}
        channelId={channelId}
        channelPhotoUrl={channelPhotoUrl}
        watermarkPreview={watermarkPreview}
        customEmojiPacks={customEmojiPacks}
        categoryIcons={categoryIcons}
        preferenceIcons={preferenceIcons}
        retryPending={retryPending}
        onRegenerateFailure={onRegenerateFailure}
        editsOpen={editsOpen}
        onToggleEdits={() => setEditsOpen((open) => !open)}
        edits={edits}
        textFeedback={textFeedback}
        imageFeedback={imageFeedback}
        pending={actionPending}
        pendingAction={pendingAction}
        isSaved={isSaved}
        hasUnsavedText={hasUnsavedText}
        onTextChange={onTextChange}
        onTextFeedbackChange={onTextFeedbackChange}
        onImageFeedbackChange={onImageFeedbackChange}
        onAction={onAction}
        onRememberImageRule={onRememberImageRule}
      />}

      {!running && <RunCosts run={run} />}
      {!running && (editsOpen || run.publications.length === 0) && (
        <div className="space-y-3 border-t border-neutral-800 pt-3">
          <AiPostingDictation
            label="Что нужно изменить в редакционных правилах?"
            value={ruleFeedback}
            disabled={suggestPending}
            onChange={onRuleFeedbackChange}
            placeholder="Например: меньше вводных фраз, больше практических примеров"
          />
          <Button
            variant="secondary"
            disabled={suggestPending || !ruleFeedback.trim()}
            onClick={onSuggestRule}
          >
            Предложить изменение правил
          </Button>
          {(run.feedback ?? [])
            .filter((item) => item.status === "PENDING_CONFIRMATION")
            .map((item) => (
              <AiPostingFeedbackSuggestion
                key={item.id}
                item={item}
                pending={confirmPending}
                onConfirm={() => onConfirmSuggestion(item.id)}
              />
            ))}
        </div>
      )}
    </Card>
  );
}


function RunCosts({ run }: { run: TestRun }) {
  const total = totalCost({
    planning: run.planningCost ?? null,
    text: run.textCost ?? null,
    image: run.imageCost ?? null,
    review: run.reviewCost ?? null,
  });
  return (
    <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
      <strong className="text-neutral-200">
        Итого за запуск: {total === null ? "есть неподтверждённые расходы" : money(total)}
      </strong>
      <span>Планирование: {money(run.planningCost)}</span>
      <span>Текст: {money(run.textCost)}</span>
      <span>Медиа: {money(run.imageCost)}</span>
      <span>Проверки: {money(run.reviewCost)}</span>
    </footer>
  );
}

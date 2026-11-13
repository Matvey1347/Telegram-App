"use client";

import { Clock3, RotateCcw } from "lucide-react";
import { Button, Card, StatusPill, Textarea } from "@/components/ui/primitives";
import {
  failureMessage,
  failureStageLabel,
  mediaReadiness,
  money,
  type TestRun,
} from "./ai-posting-test-console-model";
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
  channelTitle,
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
  channelTitle: string;
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
  return (
    <Card className="space-y-4 bg-neutral-900/40">
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Clock3 size={15} />
          <strong>{new Date(run.createdAt).toLocaleString()}</strong>
          <StatusPill value={run.status.toLowerCase()} />
        </div>
        <span className="text-neutral-400">
          Версия настроек {run.settingsVersion} · запуск v{run.version}
        </span>
      </header>

      {run.failures?.map((failure, index) => (
        <div
          key={`${failure.code}-${index}`}
          className="rounded-md border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-amber-200"
        >
          <p className="font-medium">
            {failure.topic
              ? `Не создана публикация «${failure.topic}»`
              : "Запуск завершился с ошибкой"}
            <span className="ml-1 text-xs font-normal text-amber-100/75">
              Этап: {failureStageLabel(failure.code)}
            </span>
          </p>
          <p className="mt-1">
            {failure.reasons?.length
              ? failure.reasons.join("; ")
              : (failureMessage[failure.code] ??
                `Не удалось подготовить публикацию (${failure.code}).`)}
          </p>
          {failure.topic && (
            <Button
              variant="secondary"
              className="mt-3"
              disabled={retryPending}
              onClick={() => onRegenerateFailure(run, index)}
            >
              <RotateCcw size={15} /> Перегенерировать публикацию
            </Button>
          )}
        </div>
      ))}

      {run.publications.length > 0 && (
        <p
          role="status"
          className={`rounded-lg border p-3 text-sm ${run.publications.every((post) => mediaReadiness(post) === "READY") ? "border-emerald-900/70 bg-emerald-950/20 text-emerald-200" : "border-amber-900/70 bg-amber-950/20 text-amber-200"}`}
        >
          {run.publications.filter((post) => mediaReadiness(post) === "READY")
            .length === run.publications.length
            ? `Все ${run.publications.length} публикации готовы с медиа.`
            : `${run.publications.filter((post) => mediaReadiness(post) === "READY").length} из ${run.publications.length} публикаций готовы с медиа.`}
        </p>
      )}

      <AiPostingPublicationCarousel
        key={run.id}
        run={run}
        channelTitle={channelTitle}
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
      />

      <footer className="flex flex-wrap gap-4 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
        <span>Планирование: {run.planningCost ?? "—"}</span>
        <span>Текст: {run.textCost ?? "—"}</span>
        <span>Медиа: {money(run.imageCost)}</span>
        <span>Проверки: {run.reviewCost ?? "—"}</span>
      </footer>
      <div className="space-y-3 border-t border-neutral-800 pt-3">
        <label className="block text-sm font-medium">
          Что нужно изменить в редакционных правилах?
          <Textarea
            value={ruleFeedback}
            onChange={(event) => onRuleFeedbackChange(event.target.value)}
            rows={2}
            placeholder="Например: меньше вводных фраз, больше практических примеров"
          />
        </label>
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
    </Card>
  );
}

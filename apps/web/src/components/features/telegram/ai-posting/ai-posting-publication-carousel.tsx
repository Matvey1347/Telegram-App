"use client";

import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  RotateCw,
  Save,
  ThumbsDown,
  ThumbsUp,
  WandSparkles,
} from "lucide-react";
import { Button, Textarea } from "@/components/ui/primitives";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import {
  mediaReadiness,
  money,
  publicationStatus,
  totalCost,
  visibleLengthBand,
  type Publication,
  type TestRun,
} from "./ai-posting-test-console-model";

type ReviewAction =
  | "approve"
  | "reject"
  | "edit"
  | "save"
  | "regenerate-text"
  | "regenerate-image";

export function AiPostingPublicationCarousel({
  run,
  channelTitle,
  edits,
  textFeedback,
  imageFeedback,
  pending,
  pendingAction,
  isSaved,
  hasUnsavedText,
  onTextChange,
  onTextFeedbackChange,
  onImageFeedbackChange,
  onAction,
  onRememberImageRule,
}: {
  run: TestRun;
  channelTitle: string;
  edits: Record<string, string>;
  textFeedback: Record<string, string>;
  imageFeedback: Record<string, string>;
  pending: boolean;
  pendingAction?: { runId: string; index: number; action: string };
  isSaved: (post: Publication) => boolean;
  hasUnsavedText: (run: TestRun, index: number, post: Publication) => boolean;
  onTextChange: (key: string, value: string) => void;
  onTextFeedbackChange: (key: string, value: string) => void;
  onImageFeedbackChange: (key: string, value: string) => void;
  onAction: (input: {
    run: TestRun;
    index: number;
    action: ReviewAction;
    value?: string;
  }) => void;
  onRememberImageRule?: (value: string) => Promise<void>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [imageRuleError, setImageRuleError] = useState("");
  const publications = run.publications ?? [];
  const index = Math.min(activeIndex, Math.max(0, publications.length - 1));
  const post = publications[index];
  const key = `${run.id}:${index}`;
  const saved = post ? isSaved(post) : true;
  const changedText = post ? hasUnsavedText(run, index, post) : false;
  const totalPublicationCost = post ? totalCost(post.costs) : null;
  const disabled = pending || saved;

  if (!post) return null;

  const rememberAndRegenerateMedia = async () => {
    const correction = (imageFeedback[key] ?? "").trim();
    if (!correction || !onRememberImageRule) return;
    setImageRuleError("");
    try {
      await onRememberImageRule(correction);
      onAction({ run, index, action: "regenerate-image", value: correction });
    } catch {
      setImageRuleError(
        "Не удалось сохранить правило для медиа. Попробуйте ещё раз.",
      );
    }
  };

  return (
    <section aria-label="Предпросмотр публикаций" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          aria-label="Предыдущая публикация"
          disabled={index <= 0}
          onClick={() => setActiveIndex((current) => Math.max(0, current - 1))}
        >
          <ChevronLeft size={16} />
        </Button>
        <span
          className="text-sm font-medium text-neutral-300"
          aria-live="polite"
        >
          Публикация {index + 1} из {publications.length}
        </span>
        <Button
          variant="secondary"
          aria-label="Следующая публикация"
          disabled={index >= publications.length - 1}
          onClick={() =>
            setActiveIndex((current) =>
              Math.min(publications.length - 1, current + 1),
            )
          }
        >
          <ChevronRight size={16} />
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 border-t border-neutral-800 pt-4">
        <div className="min-w-0">
          <TelegramPostPreview
            channelTitle={channelTitle}
            text={edits[key] ?? post.text}
            imageUrls={post.imageUrl ? [post.imageUrl] : []}
            onTextChange={
              saved ? undefined : (value) => onTextChange(key, value)
            }
          />
          <p className="mt-2 text-xs text-neutral-400">Идея: {post.topic}</p>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">
              {publicationStatus[post.status] ?? post.status}
            </span>
            <span className="text-xs text-neutral-400">
              {post.category} · {post.format}
            </span>
            <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
              {(() => {
                const length = visibleLengthBand(post.text);
                return `${length.band} · ${length.length} знаков`;
              })()}
            </span>
            <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
              {mediaReadiness(post) === "READY"
                ? "Медиа готово"
                : mediaReadiness(post) === "FAILED"
                  ? "Не удалось подготовить медиа"
                  : "Медиа отсутствует"}
            </span>
          </div>
          {mediaReadiness(post) === "READY" && post.mediaFailureCode && (
            <p className="rounded-md border border-amber-900/70 bg-amber-950/20 p-2 text-sm text-amber-200">
              Новое медиа не подготовлено; предыдущее вложение сохранено.
            </p>
          )}
          {mediaReadiness(post) !== "READY" && (
            <p
              className={`rounded-md border p-2 text-sm ${mediaReadiness(post) === "FAILED" ? "border-rose-900/70 bg-rose-950/20 text-rose-200" : "border-amber-900/70 bg-amber-950/20 text-amber-200"}`}
            >
              {mediaReadiness(post) === "FAILED"
                ? "Текст сохранён в превью. Медиа не готово; можно повторить подготовку явно."
                : "Текст готов, но медиа не найдено. Превью неполное; подготовка доступна по кнопке."}
            </p>
          )}

          <details className="rounded-lg border border-neutral-800 p-3">
            <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span>Модели и расходы</span>
              <strong className="text-neutral-200">
                Итого:{" "}
                {totalPublicationCost === null
                  ? "стоимость не рассчитана"
                  : money(totalPublicationCost)}
              </strong>
            </summary>
            <div className="mt-2 space-y-1 text-xs text-neutral-400">
              {post.operations.map((op, operationIndex) => (
                <p key={`${op.stage}-${operationIndex}`}>
                  {op.stage}: {op.model} ·{" "}
                  {op.actualCost === null
                    ? op.pricingStatus === "NOT_SENT"
                      ? "$0.00 (не отправлен)"
                      : "UNKNOWN/UNPRICED"
                    : `$${op.actualCost}`}{" "}
                  · {op.status}
                </p>
              ))}
              {Object.entries(post.costs).map(([stage, cost]) => (
                <p key={stage}>
                  Итого {stage}: {money(cost)}
                </p>
              ))}
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={disabled || changedText || post.status === "REJECTED"}
              onClick={() => onAction({ run, index, action: "approve" })}
            >
              <ThumbsUp size={15} /> Одобрить
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || !changedText}
              onClick={() =>
                onAction({
                  run,
                  index,
                  action: "edit",
                  value: edits[key] ?? post.text,
                })
              }
            >
              <Check size={15} /> Сохранить текст
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || changedText || post.status !== "APPROVED"}
              onClick={() => onAction({ run, index, action: "save" })}
            >
              <Save size={15} /> Сохранить черновик
            </Button>
          </div>

          <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
            <label className="block text-sm font-medium">
              Правка текста или причина отклонения
              <Textarea
                aria-label="Правка текста"
                value={textFeedback[key] ?? ""}
                disabled={saved || pending}
                onChange={(event) =>
                  onTextFeedbackChange(key, event.target.value)
                }
                rows={2}
                placeholder="Например: сохраните смысл, но напишите по-украински и добавьте практический пример"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={disabled || changedText}
                onClick={() =>
                  onAction({
                    run,
                    index,
                    action: "regenerate-text",
                    value: textFeedback[key],
                  })
                }
              >
                <WandSparkles size={15} /> Перегенерировать текст
              </Button>
              <Button
                variant="secondary"
                disabled={
                  disabled || changedText || !(textFeedback[key] ?? "").trim()
                }
                onClick={() =>
                  onAction({
                    run,
                    index,
                    action: "reject",
                    value: textFeedback[key],
                  })
                }
              >
                <ThumbsDown size={15} /> Отклонить
              </Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
            <label className="block text-sm font-medium">
              Правка медиа и правила генерации изображений
              <Textarea
                aria-label="Правка медиа"
                value={imageFeedback[key] ?? ""}
                disabled={saved || pending}
                onChange={(event) =>
                  onImageFeedbackChange(key, event.target.value)
                }
                rows={2}
                placeholder="Например: больше лаконичной редакционной иллюстрации, без диаграмм и мелких деталей"
              />
            </label>
            <Button
              variant="secondary"
              disabled={
                disabled || !onRememberImageRule || !imageFeedback[key]?.trim()
              }
              onClick={rememberAndRegenerateMedia}
            >
              {pending &&
              pendingAction?.runId === run.id &&
              pendingAction.index === index &&
              pendingAction.action === "regenerate-image" ? (
                <RotateCw size={15} className="animate-spin" />
              ) : (
                <ImagePlus size={15} />
              )}
              Сохранить правило и обновить медиа
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || changedText}
              onClick={() =>
                onAction({ run, index, action: "regenerate-image" })
              }
            >
              {mediaReadiness(post) === "READY"
                ? "Новое медиа"
                : "Создать медиа"}
            </Button>
            {imageRuleError && (
              <p role="alert" className="text-sm text-rose-300">
                {imageRuleError}
              </p>
            )}
          </div>
          {post.rejectionReason && (
            <p className="text-xs text-amber-300">
              Причина: {post.rejectionReason}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

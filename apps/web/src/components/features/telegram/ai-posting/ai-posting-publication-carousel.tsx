"use client";

import type {
  ResolvedEmoji,
  TelegramCustomEmojiPackSummary,
} from "@telegram-system/shared";
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
import { IconAvatar } from "@/components/icons/icon-avatar";
import { Button } from "@/components/ui/primitives";
import { TelegramPostSendToBotButton } from "@/components/features/telegram/telegram/telegram-post-send-to-bot-button";
import { AiPostingDictation } from "./ai-posting-dictation";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import {
  failureMessage,
  mediaReadiness,
  money,
  totalCost,
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
  customEmojiPacks,
  categoryIcons,
  preferenceIcons,
  editsOpen,
  onToggleEdits,
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
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
  categoryIcons?: Record<string, ResolvedEmoji>;
  preferenceIcons?: Record<string, ResolvedEmoji>;
  editsOpen: boolean;
  onToggleEdits: () => void;
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
      {publications.length > 1 && (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            aria-label="Предыдущая публикация"
            disabled={index <= 0}
            onClick={() =>
              setActiveIndex((current) => Math.max(0, current - 1))
            }
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
      )}

      <div className="grid min-w-0 gap-4 border-t border-neutral-800 pt-4">
        <div className="min-w-0">
          <TelegramPostPreview
            channelTitle={channelTitle}
            customEmojiPacks={customEmojiPacks}
            text={edits[key] ?? post.text}
            imageUrls={post.imageUrl ? [post.imageUrl] : []}
            onTextChange={
              saved ? undefined : (value) => onTextChange(key, value)
            }
          />
          <p className="mt-2 text-xs text-neutral-400">Идея: {post.topic}</p>
        </div>
        <div className="space-y-3">
          {post.editorialMetadata && (
            <div className="flex flex-wrap gap-2 text-xs" aria-label="Редакционная структура публикации">
              {post.editorialMetadata.sphere && <span className="rounded-full border border-blue-900/70 bg-blue-950/40 px-2 py-1 text-blue-200">{post.editorialMetadata.sphere.emoji} {post.editorialMetadata.sphere.name}</span>}
              {post.editorialMetadata.rubric && <span className="rounded-full border border-violet-900/70 bg-violet-950/40 px-2 py-1 text-violet-200">{post.editorialMetadata.rubric.emoji} {post.editorialMetadata.rubric.name}</span>}
              {post.editorialMetadata.length && <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200">{post.editorialMetadata.length.emoji} {post.editorialMetadata.length.name}</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200">
              <IconAvatar
                icon={
                  categoryIcons?.[post.category] ?? {
                    type: "unicode",
                    value: "💡",
                  }
                }
                label={post.category}
                size="xs"
                bordered={false}
              />
              Рубрика: {post.category}
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-neutral-200">
              <IconAvatar
                icon={
                  (post.mediaPreference &&
                    preferenceIcons?.[post.mediaPreference.id]) ?? {
                    type: "unicode",
                    value: "🎨",
                  }
                }
                label={post.mediaPreference?.name ?? "Предпочтение медиа"}
                size="xs"
                bordered={false}
              />
              Предпочтение: {post.mediaPreference?.name ?? "не сохранено"}
            </span>
          </div>
          {post.imageUrl && (
            <p className="text-xs text-neutral-400">
              Источник медиа:{" "}
              {post.imageSourceId === "openai-image-generation"
                ? "создано с помощью AI"
                : post.imageSourceId
                  ? "найденное изображение"
                  : "неизвестен"}
            </p>
          )}
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
                ? (post.mediaFailureCode &&
                    failureMessage[post.mediaFailureCode]) ||
                  "Текст сохранён в превью. Медиа не готово; можно повторить подготовку явно."
                : "Текст готов, но медиа не найдено. Превью неполное; подготовка доступна по кнопке."}
            </p>
          )}

          {mediaReadiness(post) !== "READY" && (
            <Button
              variant="primary"
              disabled={disabled || changedText}
              onClick={() =>
                onAction({ run, index, action: "regenerate-image" })
              }
            >
              Повторить создание медиа
            </Button>
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              variant="primary"
              className="min-h-10 w-full whitespace-normal"
              disabled={disabled || changedText || post.status === "REJECTED"}
              onClick={() => onAction({ run, index, action: "approve" })}
            >
              <ThumbsUp size={15} /> Одобрить
            </Button>
            <TelegramPostSendToBotButton
              recoveryKey={`ai-posting-preview:${run.id}:${index}`}
              variant="primary"
              className="min-h-10 w-full whitespace-normal"
              draft={{
                title: post.title,
                text: edits[key] ?? post.text,
                imageUrls: post.imageUrl ? [post.imageUrl] : [],
                buttonRows: [],
              }}
              disabled={pending}
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-10 w-full whitespace-normal"
              aria-expanded={editsOpen}
              onClick={onToggleEdits}
            >
              Написать правки
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
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
          {editsOpen && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
                <AiPostingDictation
                  label="Правка текста или причина отклонения"
                  ariaLabel="Правка текста"
                  value={textFeedback[key] ?? ""}
                  disabled={saved || pending}
                  onChange={(text) => onTextFeedbackChange(key, text)}
                  placeholder="Например: сохраните смысл, но напишите по-украински и добавьте практический пример"
                />
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
                      disabled ||
                      changedText ||
                      !(textFeedback[key] ?? "").trim()
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
                <AiPostingDictation
                  label="Правка медиа и правила генерации изображений"
                  ariaLabel="Правка медиа"
                  value={imageFeedback[key] ?? ""}
                  disabled={saved || pending}
                  onChange={(text) => onImageFeedbackChange(key, text)}
                  placeholder="Например: больше лаконичной редакционной иллюстрации, без диаграмм и мелких деталей"
                />
                <Button
                  variant="secondary"
                  disabled={
                    disabled ||
                    !onRememberImageRule ||
                    !imageFeedback[key]?.trim()
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
                {pending &&
                  pendingAction?.runId === run.id &&
                  pendingAction.index === index &&
                  pendingAction.action === "regenerate-image" && (
                    <p role="status" className="text-sm text-blue-300">
                      Публикация 0 из 1 · Медиа: в процессе. Текст остаётся в
                      этой публикации.
                    </p>
                  )}
                <Button
                  variant="primary"
                  disabled={disabled || changedText}
                  onClick={() =>
                    onAction({ run, index, action: "regenerate-image" })
                  }
                >
                  {pending &&
                  pendingAction?.runId === run.id &&
                  pendingAction.index === index &&
                  pendingAction.action === "regenerate-image"
                    ? "Готовим медиа…"
                    : mediaReadiness(post) === "READY"
                      ? "Новое медиа"
                      : "Повторить создание медиа"}
                </Button>
                {imageRuleError && (
                  <p role="alert" className="text-sm text-rose-300">
                    {imageRuleError}
                  </p>
                )}
              </div>
            </div>
          )}
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

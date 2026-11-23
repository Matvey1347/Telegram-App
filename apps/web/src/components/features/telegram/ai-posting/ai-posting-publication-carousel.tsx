"use client";

import { isTelegramAiPostingEmptyTextFailure, telegramAiPostingRunSlots } from "@telegram-system/shared";
import { AiPostingWatermarkPreview, type AiPostingWatermarkPreviewSettings } from "./ai-posting-watermark-preview";
import type {
  ResolvedEmoji,
  TelegramCustomEmojiPackSummary,
} from "@telegram-system/shared";
import { api } from "@/lib/api";
import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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
  failedPublicationCost,
  failureMessage,
  failureStageLabel,
  mediaReadiness,
  money,
  type Publication,
  type TestRun,
} from "./ai-posting-test-console-model";

import { AiPostingPublicationCosts } from "./ai-posting-publication-costs";

type ReviewAction =
  | "approve"
  | "reject"
  | "edit"
  | "save"
  | "regenerate-text"
  | "regenerate-image";

export function AiPostingPublicationCarousel({
  run,
  channelId,
  channelTitle,
  channelPhotoUrl,
  watermarkPreview,
  customEmojiPacks,
  categoryIcons,
  preferenceIcons,
  retryPending,
  onRegenerateFailure,
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
  channelId?: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  watermarkPreview?: AiPostingWatermarkPreviewSettings;
  customEmojiPacks?: TelegramCustomEmojiPackSummary[];
  categoryIcons?: Record<string, ResolvedEmoji>;
  preferenceIcons?: Record<string, ResolvedEmoji>;
  retryPending: boolean;
  onRegenerateFailure: (run: TestRun, failureIndex: number) => void;
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
  const slots = telegramAiPostingRunSlots(run);
  const currentSlot = Math.min(activeIndex, Math.max(0, slots.length - 1));
  const slot = slots[currentSlot];
  const index = slot?.publicationIndex ?? 0;
  const post = slot?.publicationIndex === undefined ? undefined : publications[index];
  const failure = slot?.failureIndex === undefined ? undefined : run.failures[slot.failureIndex];
  const key = `${run.id}:${index}`;
  const saved = post ? isSaved(post) : true;
  const botDraft = {
    title: post?.title ?? "",
    text: edits[key] ?? post?.text ?? "",
    imageUrls: post?.imageUrl ? [post.imageUrl] : [],
    buttonRows: [],
  };
  const changedText = post ? hasUnsavedText(run, index, post) : false;
  const disabled = pending || saved;

  if (!slots.length) return null;
  const navigation = slots.length > 1 && (
    <div className="flex items-center justify-between gap-2">
      <Button variant="secondary" aria-label="Предыдущая публикация" disabled={currentSlot === 0}
        onClick={() => setActiveIndex(currentSlot - 1)}>
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm font-medium text-neutral-300" aria-live="polite">
        Публикация {currentSlot + 1} из {slots.length}
      </span>
      <Button variant="secondary" aria-label="Следующая публикация" disabled={currentSlot >= slots.length - 1}
        onClick={() => setActiveIndex(currentSlot + 1)}>
        <ChevronRight size={16} />
      </Button>
    </div>
  );

  if (!post) {
    const waiting = run.status === "RUNNING" && !failure;
    const emptyText = failure ? isTelegramAiPostingEmptyTextFailure(failure) : false;
    const canRetryText = (emptyText || failure?.retryText) && Boolean(failure?.topic);
    const attemptCost = failure ? failedPublicationCost(run, currentSlot) : undefined;
    return (
      <section aria-label="Предпросмотр публикаций" className="space-y-3">
        {navigation}
        <div className={waiting
          ? "rounded-md border border-neutral-800 p-3 text-sm text-neutral-300"
          : "rounded-md border border-rose-900/70 bg-rose-950/20 p-3 text-sm text-rose-200"}>
          <p className="font-medium">
            {waiting ? "Публикация ещё обрабатывается" :
              failure?.topic ? `Не создана публикация «${failure.topic}»` : "Публикация не создана"}
          </p>
          {failure && slot.failureIndex !== undefined && (
            <>
              <p className="mt-1 text-xs">Этап: {failureStageLabel(failure.code)}</p>
              <p className="mt-1">
                {emptyText ? "Текст пустой." : failure.reasons?.length ? failure.reasons.join("; ") :
                  (failureMessage[failure.code] ?? `Не удалось подготовить публикацию (${failure.code}).`)}
              </p>
              {attemptCost !== undefined && (
                <p className="mt-2 text-xs text-neutral-300">
                  Расходы на попытки: {attemptCost === null ? "есть неподтверждённые расходы" : money(attemptCost)}
                </p>
              )}
              <Button variant="primary" className="mt-3" disabled={retryPending || run.status === "RUNNING"}
                onClick={() => onRegenerateFailure(run, slot.failureIndex!)}>
                <RotateCcw size={15} /> {canRetryText ? "Пересоздать текст" : "Повторить генерацию (новый запуск)"}
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }

  const canContinueSearch = Boolean(post.mediaSearch || post.mediaMode === "found" ||
    (post.mediaReadiness === "MISSING" && !post.mediaMode && post.imageSearchQuery));

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
      {navigation}

      <div className="grid min-w-0 gap-4 border-t border-neutral-800 pt-4">
        <div className="min-w-0">
          <TelegramPostPreview
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            customEmojiPacks={customEmojiPacks}
            text={edits[key] ?? post.text}
            imageUrls={post.imageUrl ? [post.imageUrl] : []}
            mediaPreview={post.imageUrl && watermarkPreview ? (
              <AiPostingWatermarkPreview
                imageUrl={post.imagePreviewUrl || post.imageUrl}
                legacy={!post.imagePreviewUrl}
                avatarUrl={channelPhotoUrl}
                settings={watermarkPreview}
              />
            ) : undefined}
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
                ? (post.imageCostUnknown
                    ? "AI-провайдер не подтвердил результат подготовки медиа. Текст сохранён."
                    : (post.mediaFailureCode && failureMessage[post.mediaFailureCode]) ||
                      "Текст сохранён. Не удалось подготовить медиа.")
                : (canContinueSearch ? failureMessage.AI_POSTING_IMAGE_SEARCH_EXHAUSTED :
                    "Текст готов, но медиа не найдено. Превью неполное; подготовка доступна по кнопке.")}
            </p>
          )}

          {mediaReadiness(post) !== "READY" && !canContinueSearch && (
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
          <AiPostingPublicationCosts post={post} />

          <div className="flex flex-wrap gap-2 [&>button]:grow">
            <Button
              variant="primary"
              className="min-h-10 whitespace-normal"
              disabled={disabled || changedText || post.status === "REJECTED"}
              onClick={() => onAction({ run, index, action: "approve" })}
            >
              <ThumbsUp size={15} /> Одобрить
            </Button>
            <TelegramPostSendToBotButton
              recoveryKey={`ai-posting-preview:${run.id}:${index}`}
              variant="primary"
              className="min-h-10 min-w-fit whitespace-nowrap px-4"
              draft={botDraft}
              prepareDraft={channelId && post.imageUrl && watermarkPreview ? async () => {
                if (!post.imagePreviewUrl)
                  throw new Error("У этого фото нет оригинала без водяного знака. Обновите медиа, чтобы отправить его с новым знаком.");
                const { enabled, size, opacity, x, y } = watermarkPreview;
                try {
                  const { data } = await api.post<{ imageUrl: string }>(
                    `/telegram-channels/${channelId}/ai-posting/test-runs/${run.id}/bot-image`,
                    { index, enabled, size, opacity, x, y },
                  );
                  return { ...botDraft, imageUrls: [data.imageUrl] };
                } catch {
                  throw new Error("Не удалось подготовить изображение с текущим водяным знаком.");
                }
              } : undefined}
              disabled={pending}
            />
            <Button
              type="button"
              variant="secondary"
              className="min-h-10 whitespace-normal"
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

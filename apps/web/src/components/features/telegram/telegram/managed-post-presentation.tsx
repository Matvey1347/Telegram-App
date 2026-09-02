
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
} from "lucide-react";
import type { TelegramManagedPost } from "@/lib/api";
import { telegramManagedPostStatusKey } from "@/lib/features/telegram/telegram-posts-i18n";
import { useI18n, useOptionalI18n, type TranslationFunction } from "@/providers/i18n-provider";

export type LongTextMode = "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";

export function managedPostScheduleUnchanged(
  post:
    | Pick<TelegramManagedPost, "status" | "scheduledAt">
    | null
    | undefined,
  nextScheduledAt: string,
) {
  if (post?.status !== "SCHEDULED" || !post.scheduledAt) return false;
  const currentTimestamp = Date.parse(post.scheduledAt);
  const nextTimestamp = Date.parse(nextScheduledAt);
  return (
    Number.isFinite(currentTimestamp) &&
    Number.isFinite(nextTimestamp) &&
    currentTimestamp === nextTimestamp
  );
}

export function managedPostScheduleUi({
  title,
  scheduleMode,
  hasInlineButtons = false,
  t,
}: {
  title?: string;
  scheduleMode?: TelegramManagedPost["scheduleMode"];
  hasInlineButtons?: boolean;
  t: TranslationFunction;
}) {
  const resolvedTitle = title ?? t("telegram.posts.newPost");
  return {
    label: hasInlineButtons
      ? t("telegram.posts.editor.schedule.system")
      : t("telegram.posts.editor.schedule.telegram"),
    message:
      scheduleMode === "LOCAL"
        ? t("telegram.posts.editor.schedule.systemResult", { title: resolvedTitle })
        : t("telegram.posts.editor.schedule.telegramResult", { title: resolvedTitle }),
  };
}

export function LongImageTextModePanel({
  mode,
  onChange,
  readOnly = false,
  textLength,
}: {
  mode: LongTextMode;
  onChange?: (mode: LongTextMode) => void;
  readOnly?: boolean;
  textLength: number;
}) {
  const { t } = useI18n();
  const options = [
    {
      value: "IMAGES_THEN_TEXT",
      icon: "🖼️",
      label: t("telegram.posts.editor.longText.imagesFirst"),
      description: t("telegram.posts.editor.longText.imagesFirstDescription"),
    },
    {
      value: "CAPTION_THEN_TEXT",
      icon: "✂️",
      label: t("telegram.posts.editor.longText.captionFirst"),
      description: t("telegram.posts.editor.longText.captionFirstDescription"),
    },
  ] as const;

  return (
    <div className={`space-y-2 rounded-lg border p-3 ${readOnly ? "border-blue-700/60 bg-blue-950/20" : "border-amber-700/60 bg-amber-950/20"}`}>
      <p className={`text-sm ${readOnly ? "text-blue-200" : "text-amber-200"}`}>
        {readOnly
          ? t("telegram.posts.editor.longText.readOnly", { count: textLength })
          : t("telegram.posts.editor.longText.choose", { count: textLength })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => !readOnly && onChange?.(option.value)}
              aria-pressed={selected}
              aria-disabled={readOnly}
              className={`flex min-h-16 items-start gap-2 rounded-lg border p-3 text-left transition ${selected ? "border-blue-500 bg-blue-950/40 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-300"} ${readOnly ? "" : "hover:border-neutral-500"}`}
            >
              <span className="text-lg">{option.icon}</span>
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs text-neutral-400">{option.description}</span>
                {readOnly && selected ? <span className="mt-2 block text-xs font-medium text-blue-300">{t("telegram.posts.editor.longText.selected")}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PostStatusIcon({ status }: { status: TelegramManagedPost["status"] }) {
  const i18n = useOptionalI18n();
  const statusKey = telegramManagedPostStatusKey(status);
  const label = i18n?.t(statusKey) ?? statusKey;
  if (status === "PUBLISHED") return <CheckCircle2 size={18} className="shrink-0 text-emerald-400" aria-label={label} />;
  if (status === "SCHEDULED") return <Clock3 size={18} className="shrink-0 text-blue-400" aria-label={label} />;
  if (status === "FAILED") return <AlertTriangle size={18} className="shrink-0 text-red-400" aria-label={label} />;
  if (status === "PUBLISHING") return <LoaderCircle size={18} className="shrink-0 animate-spin text-amber-300" aria-label={label} />;
  return <FileText size={18} className="shrink-0 text-neutral-400" aria-label={label} />;
}

export function publishModeLabel(t: TranslationFunction, mode?: string | null, imageCount = 0, textLength = 0) {
  if (mode === "IMAGES_THEN_TEXT") return t("telegram.posts.editor.publishMode.imagesThenText");
  if (mode === "CAPTION_THEN_TEXT") return t("telegram.posts.editor.publishMode.captionThenText");
  if (mode === "IMAGE_WITH_CAPTION") return t("telegram.posts.editor.publishMode.imageCaption");
  if (mode === "TEXT_PARTS") return t("telegram.posts.editor.publishMode.textParts");
  if (imageCount && textLength > 1024) return t("telegram.posts.editor.publishMode.imagesThenText");
  return imageCount ? t("telegram.posts.editor.publishMode.imageCaption") : t("telegram.posts.editor.publishMode.text");
}

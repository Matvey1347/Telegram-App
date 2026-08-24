import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
} from "lucide-react";
import type { TelegramManagedPost } from "@/lib/api";

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
  title = "Post",
  scheduleMode,
  hasInlineButtons = false,
}: {
  title?: string;
  scheduleMode?: TelegramManagedPost["scheduleMode"];
  hasInlineButtons?: boolean;
}) {
  return {
    label: hasInlineButtons
      ? "Schedule via Nexeloq"
      : "Schedule in Telegram",
    message:
      scheduleMode === "LOCAL"
        ? `"${title}" scheduled for automatic publishing by Telegram System. Inline buttons require system delivery, so the post will appear in Telegram at publication time, not in Telegram Scheduled Messages.`
        : `"${title}" scheduled in Telegram.`,
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
  const options = [
    {
      value: "IMAGES_THEN_TEXT",
      icon: "🖼️",
      label: "Publish images first, then text as separate message",
      description: "Images have no caption; the complete text follows.",
    },
    {
      value: "CAPTION_THEN_TEXT",
      icon: "✂️",
      label: "Publish as image with short caption",
      description: "Use the maximum caption, then send the remaining text.",
    },
  ] as const;

  return (
    <div className={`space-y-2 rounded-lg border p-3 ${readOnly ? "border-blue-700/60 bg-blue-950/20" : "border-amber-700/60 bg-amber-950/20"}`}>
      <p className={`text-sm ${readOnly ? "text-blue-200" : "text-amber-200"}`}>
        {readOnly
          ? `Publishing choice used for this post. Text length: ${textLength}.`
          : `Text with images must be 1024 characters or fewer to stay in one Telegram message. Current length: ${textLength}. Choose how to publish the remaining text:`}
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
                {readOnly && selected ? <span className="mt-2 block text-xs font-medium text-blue-300">Selected when published</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PostStatusIcon({ status }: { status: TelegramManagedPost["status"] }) {
  if (status === "PUBLISHED") return <CheckCircle2 size={18} className="shrink-0 text-emerald-400" aria-label="Published" />;
  if (status === "SCHEDULED") return <Clock3 size={18} className="shrink-0 text-blue-400" aria-label="Scheduled" />;
  if (status === "FAILED") return <AlertTriangle size={18} className="shrink-0 text-red-400" aria-label="Failed" />;
  if (status === "PUBLISHING") return <LoaderCircle size={18} className="shrink-0 animate-spin text-amber-300" aria-label="Publishing" />;
  return <FileText size={18} className="shrink-0 text-neutral-400" aria-label="Draft" />;
}

export function publishModeLabel(mode?: string | null, imageCount = 0, textLength = 0) {
  if (mode === "IMAGES_THEN_TEXT") return "Published as images, then full text";
  if (mode === "CAPTION_THEN_TEXT") return "Published with a short caption, then remaining text";
  if (mode === "IMAGE_WITH_CAPTION") return "Published as image with caption";
  if (mode === "TEXT_PARTS") return "Published as multiple text messages";
  if (imageCount && textLength > 1024) return "Published as images, then full text";
  return imageCount ? "Published as image with caption" : "Published as a text message";
}

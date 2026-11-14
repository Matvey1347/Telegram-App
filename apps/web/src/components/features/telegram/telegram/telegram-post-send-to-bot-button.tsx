"use client";

import { Send } from "lucide-react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { hasInvalidTelegramInlineButtons } from "@/lib/features/telegram/telegram-inline-buttons";
import { useI18n } from "@/providers/i18n-provider";

export function TelegramPostSendToBotButton({
  draft,
  disabled = false,
  recoveryKey = "telegram-post-editor-preview",
  variant = "secondary",
  className,
}: {
  draft: TelegramSystemBotPostDraft;
  disabled?: boolean;
  recoveryKey?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const { t } = useI18n();
  const botFlow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey,
    importContext: "Telegram post editor",
    previewDraft: draft,
    errorCopy: {
      preview: t("telegram.posts.editor.sendToBotError"),
    },
  });
  const hasContent = Boolean(
    draft.text.trim() || draft.imageUrls.length || draft.mediaItems?.length,
  );
  const hasInvalidInlineButtons = hasInvalidTelegramInlineButtons(
    draft.buttonRows,
  );

  return (
    <div className="contents">
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={
          disabled ||
          !hasContent ||
          hasInvalidInlineButtons ||
          botFlow.sendStatus === "working"
        }
        onClick={() => void botFlow.send(draft)}
      >
        <Send size={15} />
        {botFlow.sendStatus === "working"
          ? t("telegram.posts.editor.sendingToBot")
          : botFlow.sendStatus === "done"
            ? t("telegram.posts.editor.sentToBot")
            : t("telegram.posts.editor.sendToBot")}
      </Button>
      {hasInvalidInlineButtons ? (
        <p className="col-span-full w-full text-right text-xs text-rose-400">
          {t("telegram.posts.editor.error.inlineButtonUrl")}
        </p>
      ) : botFlow.error ? (
        <p className="col-span-full w-full text-right text-xs text-rose-400">
          {botFlow.error}
        </p>
      ) : null}
    </div>
  );
}

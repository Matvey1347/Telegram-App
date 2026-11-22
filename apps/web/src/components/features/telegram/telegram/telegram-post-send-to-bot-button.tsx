"use client";

import { useRef, useState } from "react";
import { Send } from "lucide-react";
import type { TelegramSystemBotPostDraft } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { hasInvalidTelegramInlineButtons } from "@/lib/features/telegram/telegram-inline-buttons";
import { useI18n } from "@/providers/i18n-provider";

export function TelegramPostSendToBotButton({
  draft,
  prepareDraft,
  disabled = false,
  recoveryKey = "telegram-post-editor-preview",
  variant = "secondary",
  className,
}: {
  draft: TelegramSystemBotPostDraft;
  prepareDraft?: () => Promise<TelegramSystemBotPostDraft>;
  disabled?: boolean;
  recoveryKey?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const preparingRef = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");
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
          disabled || preparing ||
          !hasContent ||
          hasInvalidInlineButtons ||
          botFlow.sendStatus === "working"
        }
        onClick={async () => {
          if (preparingRef.current) return;
          setPrepareError("");
          if (!prepareDraft) return botFlow.send(draft);
          preparingRef.current = true;
          setPreparing(true);
          try {
            await botFlow.send(await prepareDraft());
          } catch (error) {
            setPrepareError(error instanceof Error ? error.message : t("telegram.posts.editor.sendToBotError"));
          } finally {
            preparingRef.current = false;
            setPreparing(false);
          }
        }}
      >
        <Send size={15} />
        {preparing || botFlow.sendStatus === "working"
          ? t("telegram.posts.editor.sendingToBot")
          : botFlow.sendStatus === "done"
            ? t("telegram.posts.editor.sentToBot")
            : t("telegram.posts.editor.sendToBot")}
      </Button>
      {hasInvalidInlineButtons ? (
        <p className="col-span-full w-full text-right text-xs text-rose-400">
          {t("telegram.posts.editor.error.inlineButtonUrl")}
        </p>
      ) : prepareError || botFlow.error ? (
        <p className="col-span-full w-full text-right text-xs text-rose-400">
          {prepareError || botFlow.error}
        </p>
      ) : null}
    </div>
  );
}

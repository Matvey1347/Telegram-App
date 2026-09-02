"use client";


import { useState } from "react";
import { buildTelegramGptContextFilename } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { Download } from "lucide-react";
import { TelegramCardMenuAction } from "./telegram-card-actions-menu";
import { useI18n } from "@/providers/i18n-provider";
import { safeApiErrorMessage } from "@/i18n/error-localization";

export function GptContextDownloadButton({
  channelId,
  channelTitle,
  presentation = "button",
}: {
  channelId: string;
  channelTitle: string;
  presentation?: "button" | "menu";
}) {
  const { locale, t } = useI18n();
  const { pushToast } = useAppToast();
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = await telegramChannelsApi.gptContext(channelId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = buildTelegramGptContextFilename(channelTitle);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushToast(t("telegram.posts.support.contextDownloaded"), "success");
    } catch (error) {
      pushToast(
        safeApiErrorMessage(error, locale, t, t("common.error.generic")),
        "error",
      );
    } finally {
      setDownloading(false);
    }
  };

  if (presentation === "menu") {
    return (
      <TelegramCardMenuAction
        label={downloading ? t("telegram.posts.support.downloadingContextLabel") : t("telegram.posts.support.context")}
        icon={<Download size={15} />}
        disabled={downloading}
        onClick={() => void download()}
      />
    );
  }

  return (
    <Button
      variant="secondary"
      className="shrink-0"
      aria-label={t("telegram.posts.support.context")}
      disabled={downloading}
      aria-busy={downloading}
      onClick={download}
    >
      <Download size={15} />
      {t("telegram.posts.support.context")}
      {downloading ? (
        <span
          role="status"
          aria-label={t("telegram.posts.support.downloadingContext")}
          className="inline-block w-4 animate-pulse text-left tracking-widest"
        >
          <span aria-hidden="true">...</span>
        </span>
      ) : null}
    </Button>
  );
}

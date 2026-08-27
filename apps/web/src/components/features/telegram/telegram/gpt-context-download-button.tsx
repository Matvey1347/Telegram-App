"use client";

import { useState } from "react";
import { buildTelegramGptContextFilename } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { telegramChannelsApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { Download } from "lucide-react";
import { TelegramCardMenuAction } from "./telegram-card-actions-menu";

export function GptContextDownloadButton({
  channelId,
  channelTitle,
  presentation = "button",
}: {
  channelId: string;
  channelTitle: string;
  presentation?: "button" | "menu";
}) {
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
      pushToast("Context downloaded.", "success");
    } catch (error) {
      pushToast(
        apiErrorMessage(error, "Could not download GPT context"),
        "error",
      );
    } finally {
      setDownloading(false);
    }
  };

  if (presentation === "menu") {
    return (
      <TelegramCardMenuAction
        label={downloading ? "Downloading Context…" : "Context"}
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
      aria-label="Context"
      disabled={downloading}
      aria-busy={downloading}
      onClick={download}
    >
      <Download size={15} />
      Context
      {downloading ? (
        <span
          role="status"
          aria-label="Downloading context"
          className="inline-block w-4 animate-pulse text-left tracking-widest"
        >
          <span aria-hidden="true">...</span>
        </span>
      ) : null}
    </Button>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const message = apiError.response?.data?.message;
  return Array.isArray(message)
    ? message.join(", ")
    : message || apiError.message || fallback;
}

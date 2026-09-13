"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { telegramChannelsApi, type TelegramChannel } from "@/lib/api";
import { useOperationFeedback } from "@/providers/toast-provider";

export function parseTelegramChannelReferences(input: string) {
  return [
    ...new Set(
      input
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function useTelegramChannelBatchImport({
  setChannels,
  setSelectedIds,
  onError,
}: {
  setChannels: Dispatch<SetStateAction<TelegramChannel[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  onError: (message: string) => void;
}) {
  const [importing, setImporting] = useState(false);
  const operation = useOperationFeedback();
  const importReferences = useCallback(
    async (input: string) => {
      const inputs = parseTelegramChannelReferences(input);
      if (!inputs.length) return;
      setImporting(true);
      onError("");
      let successful = 0;
      let failed = 0;
      const feedback = operation.start({
        id: `telegram-channel-batch-import:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
        title: "Importing Telegram channels",
        message: `Checking 0 of ${inputs.length} channels…`,
        current: 0,
        total: inputs.length,
      });
      try {
        const result = await telegramChannelsApi.importBatchWithProgress(
          inputs,
          (item, current, total) => {
            if (item.success) successful += 1;
            else failed += 1;
            feedback.update({
              message: item.success
                ? `Imported ${item.input}`
                : `Could not import ${item.input}`,
              current,
              total,
              progressSummary: { successful, failed },
              details: item.error,
            });
          },
        );
        setChannels((current) => {
          const byId = new Map(current.map((channel) => [channel.id, channel]));
          result.channels.forEach((channel) => byId.set(channel.id, channel));
          return [...byId.values()];
        });
        setSelectedIds((current) => [
          ...new Set([
            ...current,
            ...result.channels.map((channel) => channel.id),
          ]),
        ]);
        if (result.failures.length) {
          const details = result.failures
            .map((failure) => `${failure.input}: ${failure.error}`)
            .join("\n");
          if (result.channels.length) {
            feedback.succeed({
              message: `${result.channels.length} imported; ${result.failures.length} failed`,
              details,
              progressSummary: {
                successful: result.channels.length,
                failed: result.failures.length,
              },
            });
          } else {
            feedback.fail({
              message: `Could not import ${result.failures.length} channel${result.failures.length === 1 ? "" : "s"}`,
              details,
              progressSummary: {
                successful: 0,
                failed: result.failures.length,
              },
            });
          }
        } else {
          feedback.succeed({
            message: `${result.channels.length} channel${result.channels.length === 1 ? "" : "s"} imported`,
            progressSummary: {
              successful: result.channels.length,
              failed: 0,
            },
          });
        }
      } catch (error) {
        feedback.fail({
          message: "Could not import the Telegram channels",
          details: error instanceof Error ? error.message : undefined,
        });
        throw error;
      } finally {
        setImporting(false);
      }
    },
    [onError, operation, setChannels, setSelectedIds],
  );

  return { importing, importReferences };
}

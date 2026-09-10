import type {
  ConsumerFinanceImportProgress,
  ConsumerFinanceImportResult,
} from "@telegram-system/shared";
import { createRequestCorrelationId } from "@/lib/http/transport";
import {
  consumerFinanceRoot,
  resolveConsumerFinanceApiBase,
} from "./consumer-finance-http";

type ImportStreamEvent =
  | {
      type: "progress";
      item: ConsumerFinanceImportProgress;
      current: number;
      total: number;
    }
  | { type: "complete"; result: ConsumerFinanceImportResult }
  | {
      type: "error";
      message: string;
      code?: string;
      path?: string;
      correlationId?: string;
    };

function streamError(event: Extract<ImportStreamEvent, { type: "error" }>) {
  const error = new Error(event.message) as Error & {
    code?: string;
    path?: string;
    correlationId?: string;
  };
  error.code = event.code;
  error.path = event.path;
  error.correlationId = event.correlationId;
  return error;
}

export async function importConsumerFinanceData(input: {
  botId: string;
  file: File;
  signal?: AbortSignal;
  onProgress: (
    progress: ConsumerFinanceImportProgress,
    current: number,
    total: number,
  ) => void;
}) {
  const correlationId = createRequestCorrelationId();
  const form = new FormData();
  form.append("file", input.file, input.file.name);
  const response = await fetch(
    `${resolveConsumerFinanceApiBase()}${consumerFinanceRoot(encodeURIComponent(input.botId))}/import-stream`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/x-ndjson",
        "X-Correlation-Id": correlationId,
        "X-Finance-Consumer-Request": "1",
      },
      body: form,
      signal: input.signal,
    },
  );
  if (!response.ok || !response.body) {
    const body = await response.text();
    try {
      const payload = JSON.parse(body) as {
        message?: string | string[];
        code?: string;
        path?: string;
      };
      throw streamError({
        type: "error",
        message: Array.isArray(payload.message)
          ? payload.message.join("; ")
          : (payload.message ?? `Import failed with status ${response.status}`),
        code: payload.code,
        path: payload.path,
        correlationId: response.headers.get("X-Correlation-Id") ?? undefined,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(body || `Import failed with status ${response.status}`);
      }
      throw error;
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: ConsumerFinanceImportResult | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as ImportStreamEvent;
    if (event.type === "progress") {
      input.onProgress(event.item, event.current, event.total);
    } else if (event.type === "complete") {
      completed = event.result;
    } else {
      throw streamError(event);
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(consume);
    if (done) break;
  }
  consume(buffer);
  if (!completed) throw new Error("Import stream ended before completion");
  return completed;
}

export const CONSUMER_FINANCE_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

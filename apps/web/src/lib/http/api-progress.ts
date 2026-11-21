import type {
  BulkActionResult,
  BulkActionResultItem,
  StreamEvent,
} from "@telegram-system/shared";
import { getAccessToken } from "../features/identity/auth";
import { apiBaseUrl, beginApiRequest } from "./api-client";
import { fetchApiStream } from "./production-confirmation";

export type BulkProgressHandler = (
  item: BulkActionResultItem,
  current: number,
  total: number,
) => void;

export type StreamProgressHandler<TItem = BulkActionResultItem> = (
  item: TItem,
  current: number,
  total: number,
) => void;
export type StreamRequestOptions = {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: "POST" | "PATCH";
  onHeartbeat?: () => void;
};
async function streamAction<TResult, TItem = BulkActionResultItem>(
  path: string,
  payload: unknown,
  onProgress: StreamProgressHandler<TItem>,
  options?: StreamRequestOptions,
): Promise<TResult> {
  const correlationId = beginApiRequest();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
    "X-Correlation-Id": correlationId,
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const workspaceId = localStorage.getItem("selected-workspace-id");
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  }
  Object.assign(headers, options?.headers);
  const response = await fetchApiStream(
    `${apiBaseUrl}${path}`,
    {
      method: options?.method ?? "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload ?? {}),
      signal: options?.signal,
    },
    payload,
  );
  if (!response.ok || !response.body) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as {
        message?: string;
        correlationId?: string;
      };
      const error = new Error(
        parsed.message || `Request failed with status ${response.status}`,
      ) as Error & { correlationId?: string };
      error.correlationId = parsed.correlationId;
      throw error;
    } catch {
      throw new Error(body || `Request failed with status ${response.status}`);
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: TResult | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent<TResult, TItem>;
    if (event.type === "progress") {
      onProgress(event.item, event.current, event.total);
    } else if (event.type === "heartbeat") {
      options?.onHeartbeat?.();
    } else if (event.type === "complete") {
      completed = event.result;
    } else {
      const error = new Error(event.message) as Error & {
        correlationId?: string;
      };
      error.correlationId = event.correlationId;
      throw error;
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
    if (done) break;
  }
  consumeLine(buffer);
  if (!completed) throw new Error("The bulk action stream ended unexpectedly");
  return completed as TResult;
}

export async function streamBulkAction(
  path: string,
  payload: unknown,
  onProgress: BulkProgressHandler,
) {
  return streamAction<BulkActionResult, BulkActionResultItem>(
    path,
    payload,
    onProgress,
  );
}

export async function streamProgressAction<
  TResult,
  TItem = { message?: string },
>(
  path: string,
  payload: unknown,
  onProgress: StreamProgressHandler<TItem>,
  options?: StreamRequestOptions,
): Promise<TResult> {
  return streamAction<TResult, TItem>(path, payload, onProgress, options);
}

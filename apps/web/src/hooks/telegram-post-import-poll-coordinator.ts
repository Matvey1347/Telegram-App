import type {
  TelegramSystemBotPostDraft,
  TelegramSystemBotPostImportMode,
  TelegramSystemBotPostImportResult,
  TelegramSystemBotPostImportStatus,
} from "@telegram-system/shared";
import { telegramSystemBotApi } from "@/lib/api";

type PollSubscriber = {
  wake: () => void;
  terminal: (
    workflowId: string,
    status: TelegramSystemBotPostImportStatus,
  ) => void;
};
export type PostImportFlowErrorCopy = {
  active?: string;
  read?: string;
  start?: string;
  cancel?: string;
  preview?: string;
};

const readsInFlight = new Map<
  string,
  Promise<TelegramSystemBotPostImportResult>
>();
const pollLeases = new Map<
  string,
  { owner: symbol; subscribers: Map<symbol, PollSubscriber> }
>();

export type ImportedValue<M extends TelegramSystemBotPostImportMode> =
  M extends "single"
    ? TelegramSystemBotPostDraft
    : TelegramSystemBotPostDraft[];

export function postImportStorageKey(
  workspaceId: string,
  mode: TelegramSystemBotPostImportMode,
) {
  return `telegram-system-bot-post-import:${workspaceId}:${mode}`;
}

export function importedValue<M extends TelegramSystemBotPostImportMode>(
  mode: M,
  drafts: TelegramSystemBotPostDraft[],
): ImportedValue<M> {
  if (mode === "single") {
    if (drafts.length !== 1)
      throw new Error("Expected exactly one imported post");
    return drafts[0] as ImportedValue<M>;
  }
  return drafts as ImportedValue<M>;
}

export async function readPostImportOnce(workflowId: string) {
  const pending = readsInFlight.get(workflowId);
  if (pending) return pending;
  const request = telegramSystemBotApi.readPostImport(workflowId);
  readsInFlight.set(workflowId, request);
  try {
    return await request;
  } finally {
    readsInFlight.delete(workflowId);
  }
}

export function subscribeToPollLease(
  key: string,
  id: symbol,
  subscriber: PollSubscriber,
) {
  const lease = pollLeases.get(key) ?? {
    owner: id,
    subscribers: new Map<symbol, PollSubscriber>(),
  };
  lease.subscribers.set(id, subscriber);
  pollLeases.set(key, lease);
  return {
    ownsLease: lease.owner === id,
    release: () => {
      lease.subscribers.delete(id);
      if (lease.owner !== id) return;
      const next = lease.subscribers.entries().next().value as
        | [symbol, PollSubscriber]
        | undefined;
      if (!next) {
        pollLeases.delete(key);
        return;
      }
      lease.owner = next[0];
      next[1].wake();
    },
  };
}

export function publishPollTerminal(
  key: string | undefined,
  source: symbol,
  workflowId: string,
  status: TelegramSystemBotPostImportStatus,
) {
  if (!key) return;
  for (const [id, subscriber] of pollLeases.get(key)?.subscribers ?? []) {
    if (id !== source) subscriber.terminal(workflowId, status);
  }
}

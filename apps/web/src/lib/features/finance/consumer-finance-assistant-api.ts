import type {
  ConsumerFinanceAiInsight,
  ConsumerFinanceAssistantConfirmation,
  ConsumerFinanceAssistantMessageInput,
  ConsumerFinanceAssistantMessageResult,
  ConsumerFinanceAssistantProposal,
  ConsumerFinanceAssistantStreamEvent,
} from "@telegram-system/shared";
import { createRequestCorrelationId } from "@/lib/http/transport";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
  resolveConsumerFinanceApiBase,
} from "./consumer-finance-http";

export class FinanceAssistantRequestError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "FinanceAssistantRequestError";
  }
}

export const consumerFinanceAssistantApi = {
  message: async (
    botId: string,
    input: ConsumerFinanceAssistantMessageInput,
    options: {
      onDelta?: (delta: string) => void;
      onProgress?: (progress: { stage: "UNDERSTANDING" | "PREPARING" | "CHECKING"; completed: number; total: number }) => void;
      signal?: AbortSignal;
    } = {},
  ) => {
    const response = await fetch(
      `${resolveConsumerFinanceApiBase()}${consumerFinanceRoot(botId)}/ultimate/message`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Correlation-Id": createRequestCorrelationId(),
          "X-Finance-Consumer-Request": "1",
        },
        body: JSON.stringify(input),
        signal: options.signal,
      },
    );
    if (!response.ok)
      throw new Error(`Finance assistant HTTP ${response.status}`);
    if (!response.body) throw new Error("Finance assistant stream is empty");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let result: ConsumerFinanceAssistantMessageResult | undefined;
    const consumeLine = (line: string) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as ConsumerFinanceAssistantStreamEvent;
      if (event.type === "delta") options.onDelta?.(event.delta);
      else if (event.type === "progress") options.onProgress?.(event);
      else if (event.type === "done") result = event.result;
      else if (event.type === "error") throw new FinanceAssistantRequestError(event.message, event.code);
    };

    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split(/\r?\n/u);
      pending = lines.pop() || "";
      for (const line of lines) consumeLine(line);
      if (done) break;
    }
    if (pending.trim()) consumeLine(pending);
    if (!result) throw new Error("Finance assistant stream ended early");
    return result;
  },
  ask: async (botId: string, question: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceAiInsight>(
        `${consumerFinanceRoot(botId)}/ultimate/ask`,
        { period: "CURRENT_MONTH", question },
        consumerRequest(),
      )
    ).data,
  proposeText: async (botId: string, text: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceAssistantProposal>(
        `${consumerFinanceRoot(botId)}/ultimate/entry`,
        { text },
        consumerRequest(),
      )
    ).data,
  proposeFile: async (botId: string, file: File) => {
    return consumerFinanceAssistantApi.proposeFiles(botId, [file]);
  },
  proposeFiles: async (botId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file, file.name));
    return (
      await consumerFinanceHttp.post<ConsumerFinanceAssistantProposal>(
        `${consumerFinanceRoot(botId)}/ultimate/entry/media`,
        form,
        consumerRequest(),
      )
    ).data;
  },
  confirm: async (botId: string, token: string) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceAssistantConfirmation>(
        `${consumerFinanceRoot(botId)}/ultimate/entry/${encodeURIComponent(token)}/confirm`,
        {},
        consumerRequest(),
      )
    ).data,
  cancel: async (botId: string, token: string) =>
    (
      await consumerFinanceHttp.post<{ cancelled: boolean }>(
        `${consumerFinanceRoot(botId)}/ultimate/entry/${encodeURIComponent(token)}/cancel`,
        {},
        consumerRequest(),
      )
    ).data,
  revise: async (
    botId: string,
    token: string,
    operations: Array<{
      amount: string;
      economicAmount?: string;
      accountId?: string;
      categoryId?: string | null;
      description?: string;
      occurredAt: string;
      purpose?: "ORDINARY" | "REIMBURSEMENT" | "PASS_THROUGH" | "DEBT_REPAYMENT";
      necessity?: "UNSPECIFIED" | "REQUIRED" | "DISCRETIONARY";
    }>,
    keepIndices?: number[],
  ) =>
    (
      await consumerFinanceHttp.post<{ updated: true }>(
        `${consumerFinanceRoot(botId)}/ultimate/entry/${encodeURIComponent(token)}/revise`,
        { operations, keepIndices },
        consumerRequest(),
      )
    ).data,
};

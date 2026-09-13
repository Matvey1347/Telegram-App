import type {
  ConsumerFinanceAiInsight,
  ConsumerFinanceAssistantConfirmation,
  ConsumerFinanceAssistantMessageInput,
  ConsumerFinanceAssistantMessageResult,
  ConsumerFinanceAssistantProposal,
} from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

export const consumerFinanceAssistantApi = {
  message: async (botId: string, input: ConsumerFinanceAssistantMessageInput) =>
    (
      await consumerFinanceHttp.post<ConsumerFinanceAssistantMessageResult>(
        `${consumerFinanceRoot(botId)}/ultimate/message`,
        input,
        consumerRequest(),
      )
    ).data,
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
    const form = new FormData();
    form.set("file", file);
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
};

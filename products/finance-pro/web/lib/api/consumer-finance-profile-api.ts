import type { ConsumerFinanceSettingsInput } from "@telegram-system/shared";
import {
  consumerFinanceHttp,
  consumerFinanceRoot,
  consumerRequest,
} from "./consumer-finance-http";

/** Small profile capability used by the eager shell and onboarding. */
export const consumerFinanceProfileApi = {
  updateSettings: async (
    botId: string,
    payload: ConsumerFinanceSettingsInput,
  ) =>
    (
      await consumerFinanceHttp.patch(
        `${consumerFinanceRoot(botId)}/settings`,
        payload,
        consumerRequest(),
      )
    ).data,
  uploadAvatar: async (botId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return (
      await consumerFinanceHttp.post(
        `${consumerFinanceRoot(botId)}/avatar`,
        body,
        consumerRequest(),
      )
    ).data;
  },
  clearAvatar: async (botId: string) =>
    (
      await consumerFinanceHttp.delete(
        `${consumerFinanceRoot(botId)}/avatar`,
        consumerRequest(),
      )
    ).data,
};

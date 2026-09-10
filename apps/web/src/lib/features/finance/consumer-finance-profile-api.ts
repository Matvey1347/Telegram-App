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
};

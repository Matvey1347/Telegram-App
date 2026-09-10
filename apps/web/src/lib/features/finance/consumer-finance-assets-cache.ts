import type {
  ConsumerFinanceAccount,
  ConsumerFinanceInvestment,
  ConsumerFinanceInvestmentDetail,
  ConsumerFinanceInvestmentMutation,
  ConsumerFinanceInvestmentPage,
  ConsumerFinanceSavingsGoal,
  ConsumerFinanceSavingsGoalPage,
  ConsumerFinanceSavingsMutation,
} from "@telegram-system/shared";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { consumerFinanceKeys } from "./consumer-finance-query-keys";

function replaceById<T extends { id: string }>(items: T[], entity: T) {
  return items.some((item) => item.id === entity.id)
    ? items.map((item) => (item.id === entity.id ? entity : item))
    : [entity, ...items];
}

function reconcilePage<T extends { id: string }>(
  page: { items: T[]; nextCursor: string | null },
  entity: T,
  include: boolean,
) {
  return {
    ...page,
    items: include
      ? replaceById(page.items, entity)
      : page.items.filter((item) => item.id !== entity.id),
  };
}

export function patchSavingsGoal(
  client: QueryClient,
  botId: string,
  goal: ConsumerFinanceSavingsGoal,
) {
  client.setQueryData(consumerFinanceKeys.savingsGoal(botId, goal.id), goal);
  for (const query of client
    .getQueryCache()
    .findAll({ queryKey: consumerFinanceKeys.savingsGoalLists(botId) })) {
    const filters = query.queryKey[3] as { status?: string } | undefined;
    const include = !filters?.status || filters.status === goal.status;
    client.setQueryData<
      | ConsumerFinanceSavingsGoalPage
      | InfiniteData<ConsumerFinanceSavingsGoalPage>
    >(query.queryKey, (data) => {
      if (!data) return data;
      if (!("pages" in data)) return reconcilePage(data, goal, include);
      return {
        ...data,
        pages: data.pages.map((page, index) =>
          reconcilePage(page, goal, include && index === 0),
        ),
      };
    });
  }
}

export function patchSavingsMutation(
  client: QueryClient,
  botId: string,
  mutation: ConsumerFinanceSavingsMutation,
) {
  mutation.goals.forEach((goal) => patchSavingsGoal(client, botId, goal));
  if (mutation.movement) {
    for (const goalId of [
      mutation.movement.fromGoalId,
      mutation.movement.toGoalId,
    ]) {
      if (goalId) {
        void client.invalidateQueries({
          queryKey: consumerFinanceKeys.savingsHistory(botId, goalId),
        });
      }
    }
  }
}

export function patchInvestment(
  client: QueryClient,
  botId: string,
  investment: ConsumerFinanceInvestment,
) {
  for (const query of client
    .getQueryCache()
    .findAll({ queryKey: consumerFinanceKeys.investmentLists(botId) })) {
    const filters = query.queryKey[3] as { status?: string } | undefined;
    const include = !filters?.status || filters.status === investment.status;
    client.setQueryData<
      | ConsumerFinanceInvestmentPage
      | InfiniteData<ConsumerFinanceInvestmentPage>
    >(query.queryKey, (data) => {
      if (!data) return data;
      if (!("pages" in data)) return reconcilePage(data, investment, include);
      return {
        ...data,
        pages: data.pages.map((page, index) =>
          reconcilePage(page, investment, include && index === 0),
        ),
      };
    });
  }
  client.setQueryData<ConsumerFinanceInvestmentDetail>(
    consumerFinanceKeys.investment(botId, investment.id),
    (detail) => (detail ? { ...detail, ...investment } : detail),
  );
}

export function patchInvestmentMutation(
  client: QueryClient,
  botId: string,
  mutation: ConsumerFinanceInvestmentMutation,
) {
  patchInvestment(client, botId, mutation.investment);
  if (mutation.account) {
    client.setQueryData<ConsumerFinanceAccount[]>(
      consumerFinanceKeys.accounts(botId),
      (accounts) =>
        accounts
          ? replaceById(accounts, mutation.account as ConsumerFinanceAccount)
          : accounts,
    );
  }
  if (mutation.cashFlow) {
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.investmentCashFlows(
        botId,
        mutation.investment.id,
      ),
    });
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.transactionLists(botId),
    });
  }
  if (mutation.valuation) {
    void client.invalidateQueries({
      queryKey: consumerFinanceKeys.investmentValuations(
        botId,
        mutation.investment.id,
      ),
    });
  }
  void client.invalidateQueries({
    queryKey: consumerFinanceKeys.investmentSummary(botId),
  });
}

export function invalidateConsumerAssetDerivations(
  client: QueryClient,
  botId: string,
) {
  void client.invalidateQueries({
    queryKey: consumerFinanceKeys.dashboard(botId),
  });
  void client.invalidateQueries({
    queryKey: consumerFinanceKeys.analyticsRoot(botId),
  });
}

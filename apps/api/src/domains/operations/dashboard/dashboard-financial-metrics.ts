import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { dashboardCategoryKey } from './dashboard-surface';

type DashboardTransaction = {
  id?: string;
  type: string;
  amount?: unknown;
  currency?: string | null;
  amountInPrimaryCurrency: unknown;
  description?: string | null;
  date?: Date;
  category: string;
  categoryId?: string | null;
  telegramChannelId?: string | null;
  adCampaignId?: string | null;
  mutualPromotionParticipantId?: string | null;
  categoryRef?: {
    key?: string | null;
    name?: string | null;
    iconId?: string | null;
    icon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
  } | null;
  icon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
  account?: {
    id: string;
    name: string;
    currency: string;
    icon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
  } | null;
  telegramChannel?: {
    id: string;
    title: string;
    photoUrl?: string | null;
  } | null;
};

const CHANNEL_REVENUE_KEYS = new Set(['channel_advertising_revenue']);
const CHANNEL_EXPENSE_KEYS = new Set([
  'advertising',
  'buy_channels',
  'telegram_ad_sales_reversal',
]);
const BALANCE_ADJUSTMENT_KEYS = new Set([
  'balance_adjustment',
  'fixing_balance',
]);

export function isDashboardRevenueTransaction(
  transaction: DashboardTransaction,
) {
  return (
    transaction.type === 'income' &&
    dashboardCategoryKey(transaction) !== 'investment' &&
    !isDashboardBalanceAdjustmentTransaction(transaction)
  );
}

export function isDashboardBalanceAdjustmentTransaction(
  transaction: DashboardTransaction,
) {
  return BALANCE_ADJUSTMENT_KEYS.has(dashboardCategoryKey(transaction));
}

export function isDashboardChannelRevenueTransaction(
  transaction: DashboardTransaction,
) {
  return (
    isDashboardRevenueTransaction(transaction) &&
    (Boolean(transaction.telegramChannelId) ||
      CHANNEL_REVENUE_KEYS.has(dashboardCategoryKey(transaction)))
  );
}

export function isDashboardChannelExpenseTransaction(
  transaction: DashboardTransaction,
) {
  return (
    transaction.type === 'expense' &&
    !isDashboardInvestmentTransaction(transaction) &&
    (Boolean(
      transaction.telegramChannelId ||
      transaction.adCampaignId ||
      transaction.mutualPromotionParticipantId,
    ) ||
      CHANNEL_EXPENSE_KEYS.has(dashboardCategoryKey(transaction)))
  );
}

export function buildDashboardCashFlowBreakdown(
  revenue: DashboardTransaction[],
  expenses: DashboardTransaction[],
  excludedAdjustments: DashboardTransaction[],
) {
  const sum = (rows: DashboardTransaction[]) =>
    rows.reduce(
      (total, transaction) =>
        total + Number(transaction.amountInPrimaryCurrency ?? 0),
      0,
    );
  const channelIncome = revenue.filter(isDashboardChannelRevenueTransaction);
  const channelExpenses = expenses.filter(isDashboardChannelExpenseTransaction);
  const channelIncomeTotal = sum(channelIncome);
  const channelExpensesTotal = sum(channelExpenses);
  return {
    income: {
      channels: channelIncomeTotal,
      other: sum(revenue) - channelIncomeTotal,
    },
    expenses: {
      channels: channelExpensesTotal,
      other: sum(expenses) - channelExpensesTotal,
    },
    excludedBalanceAdjustments: sum(excludedAdjustments),
  };
}

export function isDashboardInvestmentTransaction(
  transaction: DashboardTransaction,
) {
  return ['investment', 'investment_return'].includes(
    dashboardCategoryKey(transaction),
  );
}

export function revenuePerActiveSubscriber(
  revenue: number,
  activeSubscribers: number,
) {
  return activeSubscribers > 0 ? revenue / activeSubscribers : null;
}

export function buildDashboardCategoryBreakdown(
  transactions: DashboardTransaction[],
) {
  const categories = new Map<
    string,
    {
      id?: string | null;
      name: string;
      type: string;
      flow: 'income' | 'expense' | 'investment' | 'adjustment';
      bucket: 'channels' | 'other';
      amount: number;
      count: number;
      iconId?: string | null;
      icon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
      excludedFromCashFlow: boolean;
      transactions: DashboardTransaction[];
    }
  >();
  for (const transaction of transactions) {
    const category = transaction.categoryRef;
    const key = `${transaction.type}:${transaction.categoryId ?? transaction.category}`;
    const current = categories.get(key) ?? {
      id: transaction.categoryId,
      name: category?.name ?? transaction.category,
      type: transaction.type,
      flow: isDashboardBalanceAdjustmentTransaction(transaction)
        ? 'adjustment'
        : isDashboardInvestmentTransaction(transaction)
          ? 'investment'
          : transaction.type === 'income'
            ? 'income'
            : 'expense',
      bucket:
        transaction.type === 'income'
          ? isDashboardChannelRevenueTransaction(transaction)
            ? 'channels'
            : 'other'
          : isDashboardChannelExpenseTransaction(transaction)
            ? 'channels'
            : 'other',
      amount: 0,
      count: 0,
      iconId: category?.iconId ?? null,
      icon: category?.icon ?? null,
      excludedFromCashFlow:
        isDashboardBalanceAdjustmentTransaction(transaction),
      transactions: [],
    };
    current.amount += Number(transaction.amountInPrimaryCurrency ?? 0);
    current.count += 1;
    current.transactions.push(transaction);
    categories.set(key, current);
  }

  return [...categories.values()]
    .sort((left, right) => right.amount - left.amount)
    .map((row) => ({
      ...row,
      iconPresentation: iconToResolvedEmoji(row.icon),
      transactions: row.transactions
        .sort(
          (left, right) =>
            (right.date?.getTime() ?? 0) - (left.date?.getTime() ?? 0),
        )
        .map((transaction) => ({
          id: transaction.id ?? '',
          description: transaction.description ?? null,
          date: transaction.date?.toISOString() ?? '',
          type: transaction.type,
          amount: Number(transaction.amount ?? 0),
          currency: transaction.currency ?? '',
          amountInPrimaryCurrency: Number(
            transaction.amountInPrimaryCurrency ?? 0,
          ),
          iconPresentation: iconToResolvedEmoji(transaction.icon),
          account: transaction.account
            ? {
                id: transaction.account.id,
                name: transaction.account.name,
                currency: transaction.account.currency,
                iconPresentation: iconToResolvedEmoji(transaction.account.icon),
              }
            : null,
          telegramChannel: transaction.telegramChannel ?? null,
        })),
    }));
}

export type ConsumerFinanceTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredAt: string;
  description?: string;
};

export type ConsumerFinanceTransfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  toAmount: string;
  fromCurrency: string;
  toCurrency: string;
  exchangeRate: string;
  occurredAt: string;
  description?: string | null;
  deletedAt?: string | null;
  fromAccount: {
    id: string;
    name: string;
    currency: string;
    iconPresentation: ResolvedEmoji;
  };
  toAccount: {
    id: string;
    name: string;
    currency: string;
    iconPresentation: ResolvedEmoji;
  };
};

export type ConsumerFinanceTransferQuery = {
  cursor?: string;
  limit?: number;
  accountId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export type ConsumerFinanceTransferPage = {
  items: ConsumerFinanceTransfer[];
  nextCursor: string | null;
};
import type { ResolvedEmoji } from "../resolved-emoji";

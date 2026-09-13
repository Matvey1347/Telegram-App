import type {
  ConsumerFinanceExpenseNecessity,
  ConsumerFinanceTransactionPurpose,
  ConsumerFinanceTransactionType,
} from "./ledger";

export type ConsumerFinanceAssistantProposal = {
  token: string;
  operations: Array<{
    type: ConsumerFinanceTransactionType;
    amount: string;
    economicAmount?: string;
    purpose?: ConsumerFinanceTransactionPurpose;
    necessity?: ConsumerFinanceExpenseNecessity;
    currency: string;
    description: string;
    occurredAt: string;
    accountName: string;
    categoryName: string | null;
  }>;
};

export type ConsumerFinanceAssistantConfirmation = {
  transactionIds: string[];
  duplicate: boolean;
};

export type ConsumerFinanceAssistantScreen =
  | "transactions"
  | "transfers"
  | "debts"
  | "regular-payments"
  | "savings"
  | "investments"
  | "analytics"
  | "accounts"
  | "categories"
  | "budget"
  | "reminders";

export type ConsumerFinanceAssistantMessage = {
  role: "user" | "assistant";
  text: string;
};

export type ConsumerFinanceAssistantMessageInput = {
  text: string;
  history?: ConsumerFinanceAssistantMessage[];
};

export type ConsumerFinanceAssistantMessageResult = {
  kind: "ANSWER" | "CLARIFICATION" | "GUIDANCE" | "PROPOSAL";
  message: string;
  recommendedScreen?: ConsumerFinanceAssistantScreen | null;
  proposal?: ConsumerFinanceAssistantProposal;
};

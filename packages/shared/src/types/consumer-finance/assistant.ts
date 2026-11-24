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
    accountId: string;
    categoryId: string | null;
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
  | "reminders"
  | "billing";

export type ConsumerFinanceAssistantMessage = {
  role: "user" | "assistant";
  text: string;
};

export type ConsumerFinanceAssistantMessageInput = {
  text: string;
  history?: ConsumerFinanceAssistantMessage[];
  replyTo?: ConsumerFinanceAssistantMessage;
  chatId?: string;
  turnId?: string;
};

export type ConsumerFinanceAssistantMessageResult = {
  kind: "ANSWER" | "CLARIFICATION" | "GUIDANCE" | "PROPOSAL";
  message: string;
  recommendedScreen?: ConsumerFinanceAssistantScreen | null;
  proposal?: ConsumerFinanceAssistantProposal;
};

export type ConsumerFinanceAssistantStreamEvent =
  | { type: "start" }
  | { type: "timing"; totalMs: number; contextMs: number | null; modelMs: number | null; firstDeltaMs: number | null; proposalMs: number | null }
  | {
      type: "progress";
      stage: "UNDERSTANDING" | "PREPARING" | "CHECKING";
      completed: number;
      total: number;
    }
  | { type: "delta"; delta: string }
  | { type: "done"; result: ConsumerFinanceAssistantMessageResult }
  | { type: "error"; message: string; code?: string };


export type ConsumerFinanceAssistantChatMode = "GENERAL" | "ADVICE" | "TRANSACTIONS";

export type ConsumerFinanceAssistantChat = {
  id: string;
  title: string;
  mode: ConsumerFinanceAssistantChatMode;
  updatedAt: string;
  archivedAt?: string | null;
};

export type ConsumerFinanceAssistantTurn = {
  id: string;
  userText: string;
  assistantText: string | null;
  replyTo: ConsumerFinanceAssistantMessage | null;
};

export type ConsumerFinanceAssistantPage<T> = {
  items: T[];
  nextCursor: string | null;
};

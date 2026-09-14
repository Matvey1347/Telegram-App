import type { ConsumerFinanceLegacyFallback } from "./ledger";
import type { ConsumerFinanceCategorySummary } from "./ledger";

export type ConsumerFinanceLimit = {
  id: string;
  categoryId: string;
  amount: string;
  currency: string;
  spent: string;
  remaining: string;
  percentage: number;
  category: ConsumerFinanceCategorySummary;
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};

export type ConsumerFinanceReminder = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  recurrence: "MONTHLY";
  dayOfMonth: number;
  reminderOffsetMinutes: number;
  nextOccurrenceAt: string;
  enabled: boolean;
};

export type ConsumerFinanceReminderInput = {
  name: string;
  amount: string;
  currency: string;
  dayOfMonth: number;
  reminderOffsetMinutes?: number;
};

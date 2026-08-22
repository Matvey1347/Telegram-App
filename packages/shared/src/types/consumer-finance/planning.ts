import type { ConsumerFinanceLegacyFallback } from "./ledger";

export type ConsumerFinanceLimit = {
  id: string;
  categoryId: string;
  amount: string;
  currency: string;
  spent: string;
  remaining: string;
  percentage: number;
  category: { id: string; name: string; key?: string | null };
  legacyFallback?: ConsumerFinanceLegacyFallback | null;
};

export type ConsumerFinanceGoal = {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  currency: string;
  targetDate?: string | null;
  active?: boolean;
};

export type ConsumerFinanceGoalInput = {
  name: string;
  targetAmount: string;
  currentAmount?: string;
  currency: string;
  targetDate?: string;
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

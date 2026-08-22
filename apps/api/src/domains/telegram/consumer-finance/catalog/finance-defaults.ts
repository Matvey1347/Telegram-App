import type { FinanceTransactionType } from '@prisma/client';

export const DEFAULT_FINANCE_CATEGORIES: ReadonlyArray<{
  name: string;
  type: FinanceTransactionType;
  keywords: string[];
}> = [
  { name: 'Food', type: 'EXPENSE', keywords: ['сільпо', 'silpo', 'atb', 'novus', 'кава', 'coffee'] },
  { name: 'Transport', type: 'EXPENSE', keywords: ['uber', 'uklon', 'bolt', 'метро'] },
  { name: 'Fuel', type: 'EXPENSE', keywords: ['wog', 'okko', 'upg', 'заправ'] },
  { name: 'Home', type: 'EXPENSE', keywords: ['комунал', 'rent', 'оренда'] },
  { name: 'Subscriptions', type: 'EXPENSE', keywords: ['netflix', 'spotify', 'subscription'] },
  { name: 'Shopping', type: 'EXPENSE', keywords: ['rozetka', 'amazon'] },
  { name: 'Health', type: 'EXPENSE', keywords: ['аптек', 'pharmacy', 'doctor'] },
  { name: 'Entertainment', type: 'EXPENSE', keywords: ['cinema', 'кіно'] },
  { name: 'Other', type: 'EXPENSE', keywords: [] },
  { name: 'Salary', type: 'INCOME', keywords: ['зарплат', 'salary'] },
  { name: 'Other income', type: 'INCOME', keywords: [] },
];

export const FINANCE_INIT_DATA_MAX_AGE_SECONDS = 15 * 60;
export const FINANCE_PROPOSAL_TTL_MS = 15 * 60 * 1000;
export const FINANCE_UNDO_TTL_MS = 10 * 60 * 1000;

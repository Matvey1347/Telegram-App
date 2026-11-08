export type TelegramAiPostingAnalytics = {
  channelId: string;
  currency: 'USD';
  from: string;
  to: string;
  expenses: {
    knownCost: string;
    unpricedOperations: number;
    operations: number;
    failedOperations: number;
    retryOperations: number;
  };
  byStage: Array<{
    stage: 'text' | 'image' | 'planning' | 'checks' | 'other';
    knownCost: string;
    operations: number;
    unpricedOperations: number;
  }>;
  byMode: Array<{
    mode: 'TEST' | 'AUTOMATIC';
    knownCost: string;
    operations: number;
    unpricedOperations: number;
  }>;
  rejectedTests: { knownCost: string; unpricedOperations: number };
  readyPosts: number;
  unpricedReadyPosts: number;
  costPerReadyPost: string | null;
  monthlyForecast: { knownCost: string; unpricedOperations: number; basisDays: 7 };
  budgets: {
    daily: { limit: string | null; spent: string; reserved: string; remaining: string | null; exhausted: boolean };
    monthly: { limit: string | null; spent: string; reserved: string; remaining: string | null; exhausted: boolean };
  };
};

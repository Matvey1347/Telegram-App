export const TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES = 8;
export const TELEGRAM_AI_POSTING_MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export type TelegramAiPostingChatMessage = { id?: string; replyToMessageId?: string | null; role: 'user' | 'assistant'; text: string; suggestedTopic?: string };
export type TelegramAiPostingChatAction = {
  kind: 'setup' | 'revision';
  status: 'completed' | 'failed';
  message: string;
};
export type TelegramAiPostingChatReply = {
  reply: string;
  actions: TelegramAiPostingChatAction[];
  suggestedTopic: string | null;
  revisedPublication: { runId: string; version: number; publication: { title: string; text: string; imageUrl: string | null } } | null;
};

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

export type TelegramAiPostingDraftClassification = {
  sphereId: string;
  rubricId: string;
  lengthId?: string | null;
};

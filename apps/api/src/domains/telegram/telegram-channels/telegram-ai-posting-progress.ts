export type TelegramAiPostingProgress = {
  stage: string;
  runId?: string;
  publicationIndex?: number;
  attempt?: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  publication?: unknown;
};

export type TelegramAiPostingProgress = {
  stage: string;
  publicationIndex?: number;
  attempt?: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
};

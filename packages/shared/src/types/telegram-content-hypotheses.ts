import type { ResolvedEmoji } from "./resolved-emoji";

export type TelegramContentHypothesisStatus =
  | "DRAFT"
  | "ACTIVE"
  | "SUCCESSFUL"
  | "FAILED"
  | "ARCHIVED";

export type TelegramContentHypothesisMetrics = {
  linkedPosts: number;
  publishedPosts: number;
  averageViews: number | null;
  averageReactionRate: number | null;
  averageCommentRate: number | null;
  averageForwardRate: number | null;
  observedSubscriberDelta: number | null;
};

export type TelegramContentHypothesis = {
  id: string;
  telegramChannelId: string;
  name: string;
  description: string | null;
  status: TelegramContentHypothesisStatus;
  iconPresentation: ResolvedEmoji | null;
  startedAt: string | null;
  completedAt: string | null;
  conclusion: string | null;
  metrics: TelegramContentHypothesisMetrics;
  postIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TelegramContentHypothesisInput = {
  name: string;
  description?: string | null;
  status?: TelegramContentHypothesisStatus;
  iconId?: string | null;
  conclusion?: string | null;
};

export type TelegramManagedPostHypothesesInput = {
  hypothesisIds: string[];
};

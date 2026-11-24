export const MAX_TELEGRAM_AI_POSTING_BATCH_SIZE = 10;

export const DEFAULT_TELEGRAM_AI_POSTING_SEARCH_PERCENT = 70;

export function isTelegramAiPostingEmptyTextFailure(failure: { code: string; reasons?: string[] }) {
  return failure.code === 'AI_POSTING_TEXT_EMPTY' ||
    (failure.code === 'AI_POSTING_DRAFT_INVALID' &&
      failure.reasons?.some((reason) => reason.includes('непустой текст публикации')));
}

export function canRetryTelegramAiPostingText(failure: { code: string; reasons?: string[]; retryText?: boolean }) {
  return Boolean(failure.retryText || failure.code === 'AI_POSTING_CAPTION_INVALID' || isTelegramAiPostingEmptyTextFailure(failure));
}

export const TELEGRAM_AI_POSTING_MAX_MEDIA_PREFERENCES = 30;
export const TELEGRAM_AI_POSTING_MAX_MEDIA_REFERENCES = 8;
export const TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH = 1200;
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

export type TelegramAiPostingMediaGuidance = {
  searchDescription: string;
  generationDescription: string;
};

export type TelegramAiPostingReferenceAnalysisInput = {
  name: string;
  description: string;
  references: string[];
} & TelegramAiPostingMediaGuidance;

type RunSlot = {
  publicationIndex?: number;
  failureIndex?: number;
};

export function telegramAiPostingRunSlots(run: {
  requestedCount?: number;
  publications?: Array<{ publicationIndex?: number; topic?: string; mediaReadiness?: string } | null>;
  failures?: Array<{ publicationIndex?: number; topic?: string }>;
}): RunSlot[] {
  const publications = run.publications ?? [];
  const failures = run.failures ?? [];
  const uncreated = failures.flatMap((failure, index) =>
    publications.some((post) =>
      post && (typeof failure.publicationIndex === "number" && typeof post.publicationIndex === "number"
        ? post.publicationIndex === failure.publicationIndex
        : post.topic === failure.topic && post.mediaReadiness !== "READY"),
    ) ? [] : [index],
  );
  const entries = [
    ...publications.flatMap((post, publicationIndex) =>
      post ? [{ slot: post.publicationIndex, entry: { publicationIndex } }] : [],
    ),
    ...uncreated.map((failureIndex) => ({ slot: failures[failureIndex].publicationIndex, entry: { failureIndex } })),
  ];
  const slots: Array<RunSlot | undefined> = Array.from({
    length: Math.max(run.requestedCount ?? 0, entries.length),
  });
  const pending: RunSlot[] = [];
  for (const { slot, entry } of entries) {
    if (slot !== undefined && Number.isInteger(slot) && slot >= 0 && slot < slots.length && !slots[slot]) {
      slots[slot] = entry;
    } else {
      pending.push(entry);
    }
  }
  return slots.map((slot) => slot ?? pending.shift() ?? {});
}

export type TelegramAiPostingMediaStep = 'SEARCH_REVIEW' | 'REFERENCE_REVIEW' | 'GENERATE';

export const TELEGRAM_AI_POSTING_IMAGE_SOURCES = ['pinterest', 'auto', 'wikimedia', 'wordpress-photos'] as const;
export type TelegramAiPostingImageCatalog = typeof TELEGRAM_AI_POSTING_IMAGE_SOURCES[number] | 'website';

export const DEFAULT_TELEGRAM_AI_POSTING_IMAGE_URLS = [
  "https://www.pinterest.com/",
  "https://commons.wikimedia.org/",
] as const;

export function telegramAiPostingImageSourceUrl(value: unknown): string | null {
  if (value === 'pinterest') return DEFAULT_TELEGRAM_AI_POSTING_IMAGE_URLS[0];
  if (value === 'auto' || value === 'wikimedia') return DEFAULT_TELEGRAM_AI_POSTING_IMAGE_URLS[1];
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/iu.test(url.hostname)) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function telegramAiPostingImageSourceUrls(values: unknown): string[] {
  const urls = Array.isArray(values) ? values.flatMap((value) => {
    const url = telegramAiPostingImageSourceUrl(value);
    return url ? [url] : [];
  }) : [];
  return urls.length ? [...new Set(urls)] : [...DEFAULT_TELEGRAM_AI_POSTING_IMAGE_URLS];
}

export type TelegramAiPostingImageSearchRound = {
  queries: Array<{ text: string; page: number; catalog: TelegramAiPostingImageCatalog; domain?: string; candidates: number; unavailable?: boolean }>;
  inspected: number;
  usable: number;
  outcome: 'SELECTED' | 'NO_RESULTS' | 'NO_USABLE_IMAGES' | 'NO_MATCH' | 'REVIEW_UNAVAILABLE';
  observation?: string;
};

export type TelegramAiPostingImageSearch = {
  rounds: TelegramAiPostingImageSearchRound[];
  brief?: string;
  nextPageOffset: number;
};

export type TelegramAiPostingOperationContext = {
  cachedInputTokens?: number | null;
  mediaStep?: TelegramAiPostingMediaStep;
  textStep?: 'SHORTEN';
  editorialOutcome?: 'APPROVED' | 'REVISE' | 'INVALID';
  editorialNote?: string;
};

export type TelegramAiPostingRunProgress = {
  count: number;
  current: number;
  total: number;
  complete: number;
  failed: boolean;
  publicationIndex: number;
  processed?: number;
  stage?: string;
  attempt?: number;
  stages: Record<string, string>;
};

export type TelegramAiPostingRunProgressRead = {
  status: string;
  progress?: TelegramAiPostingRunProgress;
  canStop?: boolean;
  preparedCount?: number;
  updatedAt?: string;
};

export type TelegramAiPostingRunAccepted = { runId: string };

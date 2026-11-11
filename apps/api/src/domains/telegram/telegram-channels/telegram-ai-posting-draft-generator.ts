import { BadGatewayException } from '@nestjs/common';
import type { AiCategory } from '@telegram-system/shared';
import { TelegramAiPostingImageService } from './telegram-ai-posting-image.service';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import {
  renderTelegramAiPostingText,
  telegramAiPostingShortenPrompt,
  TELEGRAM_AI_POSTING_CAPTION_LIMIT,
  validateTelegramAiPostingCaption,
} from './telegram-ai-posting-render';
import {
  editorialDescription,
  mandatoryChannelRules,
} from './telegram-ai-posting-prompts';
import { parseTelegramAiPostingJson } from './telegram-ai-posting-json';
import { recentTelegramAiPostingHistory } from './telegram-ai-posting-learning';

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .toLocaleLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

type Draft = {
  title: string;
  text: string;
  imagePrompt: string;
  imageSearchQuery?: string;
  format: string;
  category: string;
};
type Run = {
  stage: string;
  attempt: number;
  operationId: string;
  category: string;
  model: string;
  status: string;
  actualCost: string | null;
  pricingStatus: string;
  inputTokens: number | null;
  outputTokens: number | null;
};
type Costs = Record<
  'planning' | 'text' | 'image' | 'review',
  { toString(): string } | null
>;

export async function generateTelegramAiPostingDraft(
  input: {
    userId: string;
    workspaceId: string;
    channelId: string;
    topic: string;
    config: Record<string, any>;
    context: Awaited<ReturnType<TelegramAiPostingSourceService['collect']>>;
    planningCost: string | null;
    previousFormats: string[];
    previousLengths: number[];
    invoke: (
      stage: Run['stage'],
      category: AiCategory,
      prompt: string,
      attempt?: number,
    ) => Promise<string>;
    operations: Run[];
    mode: 'MANUAL' | 'AUTOMATIC';
    testRunId: string;
    autopilotRunId?: string;
    publicationIndex: number;
    aiDailyBudget: string | null;
    aiMonthlyBudget: string | null;
  },
  dependencies: {
    images: TelegramAiPostingImageService;
    costs: (operations: Run[]) => Costs;
  },
) {
  const operationOffset = input.operations.length;
  const history = JSON.stringify({
    publishedHistory: recentTelegramAiPostingHistory(input.context.history),
    currentAndScheduled: input.context.existingPosts,
  }).slice(0, 30000);
  let draft: Draft | null = null;
  const configuredStyles: unknown = input.config.imageStyles;
  const imageStyles: string[] = Array.isArray(configuredStyles)
    ? configuredStyles
        .filter(
          (style: unknown): style is string =>
            typeof style === 'string' && Boolean(style.trim()),
        )
        .slice(0, 10)
    : [];
  let reviewReasons: string[] = [];
  let attempt = 0;
  let shortenedOnce = false;
  let lastFailureCode = 'AI_POSTING_REVIEW_REJECTED';
  for (; attempt < 3; attempt++) {
    const lang =
      input.config.language ||
      input.context.editorialProfile.language ||
      'English';
    const reply = await input.invoke(
      'text',
      'TELEGRAM_POSTING_TEXT',
      `Return exactly one valid JSON object with all required fields: {"title":string,"text":string,"imagePrompt":string,"imageSearchQuery":string,"imageStyleIndex":number,"format":string,"category":string}. Never omit a field; use an empty string for imageSearchQuery if needed. No markdown fences around the JSON. Write one original Telegram post in ${lang} about: ${input.topic}. Channel description and editorial guidance:\n${editorialDescription(input.config).slice(0, 7000)}\n${mandatoryChannelRules(input.config)}\n${typeof input.config.learningBlock === 'string' ? input.config.learningBlock : 'ЧТО РАБОТАЕТ В КАНАЛЕ\nДанных пока мало.'}\nReturn text using only these markup forms: **bold**, _italic_, > quote lines, [label](https://url), and paragraphs separated by a blank line. Do not return HTML, any other markdown, or Telegram formatting tags. Do not add a channel name, link, signature or configured ending yourself; application code handles ending and hashtags. Publication group choices: ${JSON.stringify(input.config.formats ?? [])}; content hypothesis choices: ${JSON.stringify(input.config.categories ?? [])}. ${input.config.allowCreateGroups === true ? 'Prefer supplied groups; suggest a new concise group name only when none fits.' : 'Choose a group only from the supplied choices, or standard if empty.'} ${input.config.allowCreateHypotheses === true ? 'Prefer supplied hypotheses; suggest a new concise content hypothesis only when none fits.' : 'Choose a hypothesis only from the supplied choices, or general if empty.'} Choose a group distinct from these already selected: ${JSON.stringify(input.previousFormats)}. Vary length is ${input.config.variedLength ? 'enabled' : 'disabled'}; existing draft lengths in characters: ${JSON.stringify(input.previousLengths)}. Keep the complete caption under ${TELEGRAM_AI_POSTING_CAPTION_LIMIT} visible characters. Avoid repeating these posts: ${history}. ${input.config.hashtags === 'disabled' ? 'Do not add hashtags.' : 'Include 1–3 relevant hashtags for the configured placement.'} Emoji policy: ${input.config.emojiPolicy === 'start' ? 'use at most one relevant emoji at the very beginning of the post and no other emojis.' : 'use emojis only when they naturally strengthen the meaning; place them sparingly, at most three in the post.'} ${reviewReasons.length ? `Revise the previous draft to address these review notes: ${JSON.stringify(reviewReasons)}.` : ''} Image preferences: ${JSON.stringify(imageStyles)}. Previously rejected visual directions for this channel: ${JSON.stringify(Array.isArray(input.config.imageAvoidances) ? input.config.imageAvoidances.slice(-5) : [])}. Do not create a closely similar scene to those directions. Choose the most suitable preference for this post and return its zero-based index as imageStyleIndex. These are preferences, not strict constraints. Write an English imagePrompt describing the post and the chosen visual direction, without text or logos. Return imageSearchQuery as a few English keywords for a relevant image in that style.`,
      attempt + 1,
    );
    const value = parseTelegramAiPostingJson(reply);
    if (
      !value ||
      typeof value.title !== 'string' ||
      typeof value.text !== 'string' ||
      (value.format !== undefined && typeof value.format !== 'string') ||
      (value.category !== undefined && typeof value.category !== 'string') ||
      !value.title.trim() ||
      !value.text.trim()
    ) {
      lastFailureCode = 'AI_POSTING_DRAFT_INVALID';
      reviewReasons = [
        'Ответ должен быть валидным JSON с непустыми title и text. imagePrompt можно не указывать.',
      ];
      continue;
    }
    const choose = (
      value: unknown,
      options: unknown,
      allowNew: boolean,
      fallback: string,
    ) => {
      const choices = Array.isArray(options)
        ? options.filter(
            (option): option is string =>
              typeof option === 'string' && Boolean(option.trim()),
          )
        : [];
      const proposed =
        typeof value === 'string' ? value.trim().slice(0, 120) : '';
      if (allowNew && proposed) return proposed;
      return (
        choices.find(
          (choice) =>
            choice.toLocaleLowerCase() === proposed.toLocaleLowerCase(),
        ) ??
        choices[0] ??
        fallback
      );
    };
    const styleIndex =
      typeof value.imageStyleIndex === 'number' &&
      Number.isInteger(value.imageStyleIndex) &&
      value.imageStyleIndex >= 0 &&
      value.imageStyleIndex < imageStyles.length
        ? value.imageStyleIndex
        : input.publicationIndex % (imageStyles.length || 1);
    draft = {
      title: value.title.trim(),
      text: renderTelegramAiPostingText(value.text, input.config),
      imagePrompt: [
        typeof value.imagePrompt === 'string' && value.imagePrompt.trim()
          ? value.imagePrompt.trim()
          : `Editorial illustration for ${input.topic}`,
        imageStyles[styleIndex]
          ? `Visual preference: ${imageStyles[styleIndex]}`
          : '',
      ]
        .filter(Boolean)
        .join('. '),
      imageSearchQuery:
        typeof value.imageSearchQuery === 'string'
          ? value.imageSearchQuery.trim().slice(0, 200)
          : '',
      format: choose(
        value.format,
        input.config.formats,
        input.config.allowCreateGroups === true,
        'standard',
      ),
      category: choose(
        value.category,
        input.config.categories,
        input.config.allowCreateHypotheses === true,
        'general',
      ),
    };
    let captionValidation = validateTelegramAiPostingCaption(
      draft.text,
      String(input.config.ending ?? ''),
    );
    if (captionValidation.errors.includes('length') && !shortenedOnce) {
      shortenedOnce = true;
      const shortened = await input.invoke(
        'text',
        'TELEGRAM_POSTING_TEXT',
        telegramAiPostingShortenPrompt(
          value.text,
          Math.max(
            1,
            TELEGRAM_AI_POSTING_CAPTION_LIMIT -
              String(input.config.ending ?? '').length -
              2,
          ),
        ),
        attempt + 1,
      );
      const shortenedValue = parseTelegramAiPostingJson(shortened);
      if (typeof shortenedValue?.text === 'string') {
        draft.text = renderTelegramAiPostingText(
          shortenedValue.text,
          input.config,
        );
        captionValidation = validateTelegramAiPostingCaption(
          draft.text,
          String(input.config.ending ?? ''),
        );
      }
    }
    if (!captionValidation.valid) {
      lastFailureCode = captionValidation.errors.includes('length')
        ? 'AI_POSTING_TELEGRAM_LENGTH'
        : 'AI_POSTING_CAPTION_INVALID';
      reviewReasons = [
        `Детерминированная проверка подписи: ${captionValidation.errors.join(', ')}.`,
      ];
      draft = null;
      if (lastFailureCode === 'AI_POSTING_TELEGRAM_LENGTH')
        throw new BadGatewayException(lastFailureCode);
      continue;
    }
    const review = await input.invoke(
      'review',
      'TELEGRAM_POSTING_REVIEW',
      `Return exactly one valid JSON object with this schema: {"approved":boolean,"reasons":[string]}. No markdown fences or extra text. Review only factual accuracy, safety, repetition, fit with the channel description, compliance with the mandatory channel rules, and tone. Do not review formatting, HTML, hashtags, caption length, or ending.\n${editorialDescription(input.config).slice(0, 7000)}\n${mandatoryChannelRules(input.config)}\nRecent and scheduled posts to compare for repetition: ${history}\nProposed post title: ${draft.title}\nProposed post text: ${draft.text}`,
      attempt + 1,
    );
    const verdict = parseTelegramAiPostingJson(review);
    if (
      !verdict ||
      typeof verdict.approved !== 'boolean' ||
      !Array.isArray(verdict.reasons)
    ) {
      lastFailureCode = 'AI_POSTING_REVIEW_INVALID';
      reviewReasons = [
        'Ответ редакционной проверки был некорректным; верните JSON с approved (boolean) и reasons (массив строк).',
      ];
      draft = null;
      continue;
    }
    if (verdict.approved) break;
    lastFailureCode = 'AI_POSTING_REVIEW_REJECTED';
    reviewReasons = verdict.reasons
      .filter((reason: unknown) => typeof reason === 'string')
      .slice(0, 8);
    draft = null;
  }
  if (!draft)
    throw new BadGatewayException({
      code: lastFailureCode,
      reasons: reviewReasons,
    });
  const normalizedDraft = normalize(draft.text);
  if (
    input.context.history.some(
      (post) => normalize(post.text) === normalizedDraft,
    ) ||
    input.context.existingPosts.some(
      (post) =>
        normalize(`${post.title} ${post.text ?? ''}`) ===
        normalize(`${draft.title} ${draft.text}`),
    )
  )
    throw new BadGatewayException('AI_POSTING_DUPLICATE_CONTENT');
  const resolvedImage = await dependencies.images.resolve({
    userId: input.userId,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    topic: input.topic,
    imageMode: input.config.imageMode ?? 'found',
    imageCandidates: input.context.imageCandidates,
    prompt: draft.imagePrompt,
    searchQuery: draft.imageSearchQuery || input.topic,
    mode: input.mode,
    aiPosting: {
      channelId: input.channelId,
      testRunId: input.testRunId,
      ...(input.mode === 'AUTOMATIC'
        ? { autopilotRunId: input.autopilotRunId ?? input.testRunId }
        : {}),
      publicationIndex: input.publicationIndex,
      attempt: 1,
      postingMode: input.mode === 'AUTOMATIC' ? 'AUTOMATIC' : 'TEST',
      dailyBudget: null,
      monthlyBudget: input.aiMonthlyBudget,
    },
  });
  if (resolvedImage.operation) input.operations.push(resolvedImage.operation);
  const image = resolvedImage.image;
  const mediaReadiness =
    resolvedImage.readiness ?? (image ? 'READY' : 'MISSING');
  const limit = image ? 1024 : 4096;
  if (draft.text.length > limit)
    throw new BadGatewayException('AI_POSTING_TELEGRAM_LENGTH');
  const runOps = [
    ...input.operations.filter((item) => item.stage === 'planning'),
    ...input.operations.slice(operationOffset),
  ];
  const costs = dependencies.costs(runOps);
  return {
    topic: input.topic,
    title: draft.title,
    text: draft.text,
    imagePrompt: draft.imagePrompt,
    format: draft.format,
    category: draft.category,
    imageUrl: image?.url ?? null,
    imageSourceId: image?.sourceId ?? null,
    reviewNotes: reviewReasons,
    costs: {
      planning: input.planningCost ?? costs.planning?.toString() ?? null,
      text: costs.text?.toString() ?? null,
      image: resolvedImage.costUnknown
        ? null
        : (costs.image?.toString() ?? null),
      review: costs.review?.toString() ?? null,
    },
    operations: runOps,
    ideaSources: input.context.sourceRefs,
    mediaReadiness,
    ...(resolvedImage.failureCode
      ? { mediaFailureCode: resolvedImage.failureCode }
      : {}),
    imageCostUnknown: Boolean(resolvedImage.costUnknown),
  };
}

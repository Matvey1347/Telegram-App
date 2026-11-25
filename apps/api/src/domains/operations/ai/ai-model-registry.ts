import { AI_LEAD_QUALIFICATION_SCHEMA } from './ai-lead-qualification-schema';
import {
  AI_LEAD_CLASSIFICATION_SCHEMA,
  AI_LEAD_EXTRACTION_SCHEMA,
  AI_LEAD_MEDIA_SCHEMA,
} from './ai-lead-output-schema';
import { Injectable } from '@nestjs/common';
import type { AiCategoryConfig } from '@prisma/client';
import {
  AI_CATEGORIES,
  type AiCategory,
  type AiCategoryConfiguration,
  type AiPrice,
} from '@telegram-system/shared';
import Ajv from 'ajv';
import { AI_SALES_OUTPUT_SCHEMA } from './ai-sales-output-schema';

const VERSION = 'openai-standard-2026-10-31';
const PRICES: AiPrice[] = [
  {
    modelId: 'gpt-6-luna',
    inputPerMillion: '0.10',
    cachedInputPerMillion: '0.01',
    cacheWritePerMillion: '0.125',
    outputPerMillion: '0.50',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
  },
  {
    modelId: 'gpt-5.4-mini-2026-03-17',
    inputPerMillion: '0.75',
    cachedInputPerMillion: '0.075',
    cacheWritePerMillion: null,
    outputPerMillion: '4.50',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.4-mini',
  },
  {
    modelId: 'gpt-image-2.5-flare',
    inputPerMillion: '5',
    cachedInputPerMillion: '1.25',
    cacheWritePerMillion: null,
    outputPerMillion: '30',
    sourceUrl: 'https://developers.openai.com/api/docs/guides/image-generation',
  },
].map((p) => ({
  ...p,
  provider: 'openai',
  currency: 'USD',
  version: VERSION,
  effectiveAt: '2026-10-31T00:00:00.000Z',
  verifiedAt: '2026-10-31T00:00:00.000Z',
}));
const REVISION_DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { title: { type: 'string' }, text: { type: 'string' }, imagePrompt: { type: 'string' } },
  required: ['title', 'text', 'imagePrompt'],
};
const CHAT_PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    reply: { type: 'string' },
    setup: { anyOf: [
      { type: 'object', additionalProperties: false, properties: { query: { type: 'string' }, rubric: { type: 'string' }, description: { type: ['string', 'null'] }, entityId: { type: ['string', 'null'] } }, required: ['query', 'rubric', 'description', 'entityId'] },
      { type: 'null' },
    ] },
    topic: { type: ['string', 'null'] },
    revision: { anyOf: [{ type: 'string', enum: ['text', 'image'] }, { type: 'null' }] },
  }, required: ['reply', 'setup', 'topic', 'revision'],
};
const text = { type: 'string', maxLength: 16000 };
function shape(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
export const TELEGRAM_POSTING_REVIEW_SCHEMA_ID = 'telegram_posting_editorial_review_v1';
const POSTING_REVIEW_SCHEMA = shape({
  approved: { type: 'boolean' },
  reasons: { type: 'array', items: { type: 'string' } },
});
export const TELEGRAM_POSTCARD_REVIEW_SCHEMA_ID = 'telegram_postcard_visual_review_v1';
const POSTCARD_REVIEW_SCHEMA = shape({
  candidateIndex: { type: 'integer' },
  candidateObservation: text,
  embeddedGreeting: { type: 'boolean' },
  visibleGreeting: text,
  referenceIndex: { type: 'integer' },
  referenceDirection: text,
  rejectionReason: text,
});
export const TELEGRAM_POSTING_DRAFT_SCHEMA_ID = 'telegram_posting_draft_v1';
const POSTING_DRAFT_SCHEMA = shape({
  title: { type: 'string' },
  text: { type: 'string' },
  imageStyleIndex: { type: 'integer' },
  imagePrompt: { type: 'string' },
  imageSearchQuery: { type: 'string' },
  voteOptions: { type: 'array', items: { type: 'string' } },
});
const SCHEMAS: Record<
  AiCategory,
  {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  }
> = {
  SALES_FIRST_DRAFT: AI_SALES_OUTPUT_SCHEMA,
  SALES_REPLY_SUGGESTION: AI_SALES_OUTPUT_SCHEMA,
  SALES_FOLLOW_UP: AI_SALES_OUTPUT_SCHEMA,
  SALES_CONVERSATION_ANALYSIS: AI_SALES_OUTPUT_SCHEMA,
  LEAD_AD_CLASSIFICATION: AI_LEAD_CLASSIFICATION_SCHEMA,
  LEAD_CONTACT_EXTRACTION: AI_LEAD_EXTRACTION_SCHEMA,
  LEAD_QUALIFICATION: AI_LEAD_QUALIFICATION_SCHEMA,
  SUPPORT_ASSISTANT: shape({ reply: text, requiresHuman: { type: 'boolean' } }),
  TELEGRAM_POSTING_PLAN: shape({ reply: text }),
  TELEGRAM_POSTING_TEXT: shape({ reply: text }),
  TELEGRAM_POSTING_REVIEW: shape({ reply: text }),
  TELEGRAM_POSTING_IMAGE: shape({ reply: text }),
};

@Injectable()
export class AiModelRegistry {
  transcriptionPrice() {
    return {
      modelId: 'gpt-transcribe',
      provider: 'openai' as const,
      version: VERSION,
      effectiveAt: '2026-10-31T00:00:00.000Z',
      verifiedAt: '2026-11-13T00:00:00.000Z',
      currency: 'USD' as const,
      inputPerMillion: '0',
      cachedInputPerMillion: '0',
      cacheWritePerMillion: null,
      outputPerMillion: '0',
      billingUnit: 'audio_seconds' as const,
      audioPerMinute: '0.0045',
      sourceUrl: 'https://developers.openai.com/api/docs/pricing',
    };
  }
  private readonly postcardReviewValidator = new Ajv({ strict: true }).compile(POSTCARD_REVIEW_SCHEMA);
  private readonly postingReviewValidator = new Ajv({ strict: true }).compile(POSTING_REVIEW_SCHEMA);
  private readonly postingDraftValidator = new Ajv({ strict: true }).compile(POSTING_DRAFT_SCHEMA);
  private readonly revisionDraftValidator = new Ajv({ strict: true }).compile(REVISION_DRAFT_SCHEMA);
  private readonly chatPlanValidator = new Ajv({ strict: true, allowUnionTypes: true }).compile(CHAT_PLAN_SCHEMA);
  private readonly mediaValidator = new Ajv({ strict: true }).compile(
    AI_LEAD_MEDIA_SCHEMA,
  );
  private readonly validators = new Map(
    AI_CATEGORIES.map((category) => [
      category,
      new Ajv({ strict: true }).compile(SCHEMAS[category]),
    ]),
  );
  models(): AiPrice[] {
    return PRICES.map((price) => ({ ...price }));
  }
  price(modelId: string): AiPrice | undefined {
    const value = PRICES.find((p) => p.modelId === modelId);
    return value && { ...value };
  }
  supports(category: AiCategory, modelId: string) {
    const imageModel = modelId.startsWith('gpt-image-');
    return category === 'TELEGRAM_POSTING_IMAGE' ? imageModel : !imageModel;
  }
  schema(category: AiCategory, media = false, chatPlan = false, revisionDraft = false, postingDraft = false, postingReview = false, postcardReview = false) {
    if (postcardReview) {
      if (category !== 'TELEGRAM_POSTING_REVIEW' || !media)
        throw new Error('AI_POSTCARD_REVIEW_CATEGORY_INVALID');
      return { id: TELEGRAM_POSTCARD_REVIEW_SCHEMA_ID, jsonSchema: structuredClone(POSTCARD_REVIEW_SCHEMA) };
    }
    if (postingReview) {
      if (category !== 'TELEGRAM_POSTING_REVIEW' || media || chatPlan || revisionDraft || postingDraft)
        throw new Error('AI_POSTING_REVIEW_CATEGORY_INVALID');
      return { id: TELEGRAM_POSTING_REVIEW_SCHEMA_ID, jsonSchema: structuredClone(POSTING_REVIEW_SCHEMA) };
    }
    if (postingDraft) {
      if (category !== 'TELEGRAM_POSTING_TEXT' || media || chatPlan || revisionDraft)
        throw new Error('AI_POSTING_DRAFT_CATEGORY_INVALID');
      return { id: TELEGRAM_POSTING_DRAFT_SCHEMA_ID, jsonSchema: structuredClone(POSTING_DRAFT_SCHEMA) };
    }
    if (revisionDraft) {
      if (category !== 'TELEGRAM_POSTING_TEXT' || media || chatPlan) throw new Error('AI_REVISION_DRAFT_CATEGORY_INVALID');
      return { id: 'telegram_posting_revision_v1', jsonSchema: structuredClone(REVISION_DRAFT_SCHEMA) };
    }
    if (chatPlan) {
      if (category !== 'TELEGRAM_POSTING_PLAN' || media) throw new Error('AI_CHAT_PLAN_CATEGORY_INVALID');
      return { id: 'telegram_posting_chat_plan_v1', jsonSchema: structuredClone(CHAT_PLAN_SCHEMA) };
    }
    if (media) {
      if (category === 'TELEGRAM_POSTING_PLAN')
        return {
          id: 'telegram_posting_chat_vision_v1',
          jsonSchema: structuredClone(SCHEMAS[category]),
        };
      if (category === 'TELEGRAM_POSTING_REVIEW')
        return { id: 'telegram_posting_visual_review_v1', jsonSchema: structuredClone(SCHEMAS[category]) };
      if (category !== 'LEAD_AD_CLASSIFICATION')
        throw new Error('AI_MEDIA_CATEGORY_INVALID');
      return {
        id: 'lead_media_vision_v1',
        jsonSchema: structuredClone(AI_LEAD_MEDIA_SCHEMA),
      };
    }
    return {
      id: `${category.toLowerCase()}_${category === 'LEAD_AD_CLASSIFICATION' ? 'discovery_evidence_v2' : category === 'LEAD_QUALIFICATION' ? 'qualification_v1' : category.startsWith('SALES_') ? 'copilot_v1' : ['LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION'].includes(category) ? 'discovery_v1' : 'infra_v1'}`,
      jsonSchema: structuredClone(SCHEMAS[category]),
    };
  }
  validate(category: AiCategory, value: unknown, media = false, chatPlan = false, revisionDraft = false, postingDraft = false, postingReview = false, postcardReview = false): boolean {
    if (postcardReview)
      return category === 'TELEGRAM_POSTING_REVIEW' && media && this.postcardReviewValidator(value) === true;
    if (postingReview)
      return category === 'TELEGRAM_POSTING_REVIEW' && !media && !chatPlan && !revisionDraft && !postingDraft && this.postingReviewValidator(value) === true;
    if (postingDraft)
      return category === 'TELEGRAM_POSTING_TEXT' && !media && !chatPlan && !revisionDraft && this.postingDraftValidator(value) === true;
    if (revisionDraft) return category === 'TELEGRAM_POSTING_TEXT' && !media && !chatPlan && this.revisionDraftValidator(value) === true;
    if (chatPlan) return category === 'TELEGRAM_POSTING_PLAN' && !media && this.chatPlanValidator(value) === true;
    if (media && (category === 'TELEGRAM_POSTING_PLAN' || category === 'TELEGRAM_POSTING_REVIEW'))
      return this.validators.get(category)?.(value) === true;
    if (media)
      return (
        category === 'LEAD_AD_CLASSIFICATION' &&
        this.mediaValidator(value) === true
      );
    return this.validators.get(category)?.(value) === true;
  }
  category(category: AiCategory): AiCategoryConfiguration {
    if (!AI_CATEGORIES.includes(category))
      throw new Error('AI_CATEGORY_INVALID');
    return {
      category,
      budgetCategory: category,
      modelId: category.startsWith('LEAD_')
        ? 'gpt-6-luna'
        : category === 'TELEGRAM_POSTING_IMAGE'
          ? 'gpt-image-2.5-flare'
          : 'gpt-5.4-mini-2026-03-17',
      enabled: false,
      automaticEnabled: false,
      maxInputTokens: 8000,
      maxOutputTokens:
        category === 'TELEGRAM_POSTING_IMAGE'
          ? 8000
          : category.includes('ANALYSIS')
            ? 2000
            : 1000,
      timeoutMs: 30000,
      concurrencyLimit: 2,
      dailyBudget: null,
      monthlyBudget: null,
      maxRequestCost: null,
      schemaId: this.schema(category).id,
      promptVersion: category.startsWith('TELEGRAM_POSTING_')
        ? `${category.toLowerCase()}-v1`
        : category === 'LEAD_AD_CLASSIFICATION'
          ? 'lead-classification-evidence-v2'
          : category === 'LEAD_QUALIFICATION'
            ? 'lead-qualification-v1'
            : category.startsWith('SALES_')
              ? 'sales-copilot-v1'
              : ['LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION'].includes(
                    category,
                  )
                ? 'lead-discovery-v1'
                : 'infra-v1',
      configurationVersion: 1,
    };
  }
  resolve(
    category: AiCategory,
    persisted?: AiCategoryConfig | null,
  ): AiCategoryConfiguration {
    const defaults = this.category(category);
    if (!persisted) return defaults;
    return {
      ...defaults,
      modelId: persisted.modelId,
      enabled: persisted.enabled,
      automaticEnabled: persisted.automaticEnabled,
      maxInputTokens: persisted.maxInputTokens,
      maxOutputTokens: persisted.maxOutputTokens,
      timeoutMs: persisted.timeoutMs,
      concurrencyLimit: persisted.concurrencyLimit,
      dailyBudget: persisted.dailyBudget?.toFixed(12) ?? null,
      monthlyBudget: persisted.monthlyBudget?.toFixed(12) ?? null,
      maxRequestCost: persisted.maxRequestCost?.toFixed(12) ?? null,
      configurationVersion: persisted.version,
    };
  }
}

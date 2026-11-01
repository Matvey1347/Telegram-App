import { AI_LEAD_QUALIFICATION_SCHEMA } from './ai-lead-qualification-schema';
import {
  AI_LEAD_CLASSIFICATION_SCHEMA,
  AI_LEAD_EXTRACTION_SCHEMA,
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
].map((p) => ({
  ...p,
  provider: 'openai',
  currency: 'USD',
  version: VERSION,
  effectiveAt: '2026-10-31T00:00:00.000Z',
  verifiedAt: '2026-10-31T00:00:00.000Z',
}));
const text = { type: 'string', maxLength: 16000 };
function shape(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
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
};

@Injectable()
export class AiModelRegistry {
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
  schema(category: AiCategory) {
    return {
      id: `${category.toLowerCase()}_${category === 'LEAD_QUALIFICATION' ? 'qualification_v1' : category.startsWith('SALES_') ? 'copilot_v1' : ['LEAD_AD_CLASSIFICATION', 'LEAD_CONTACT_EXTRACTION'].includes(category) ? 'discovery_v1' : 'infra_v1'}`,
      jsonSchema: structuredClone(SCHEMAS[category]),
    };
  }
  validate(category: AiCategory, value: unknown): boolean {
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
        : 'gpt-5.4-mini-2026-03-17',
      enabled: false,
      automaticEnabled: false,
      maxInputTokens: 8000,
      maxOutputTokens: category.includes('ANALYSIS') ? 2000 : 1000,
      timeoutMs: 30000,
      concurrencyLimit: 2,
      dailyBudget: null,
      monthlyBudget: null,
      maxRequestCost: null,
      schemaId: this.schema(category).id,
      promptVersion:
        category === 'LEAD_QUALIFICATION'
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

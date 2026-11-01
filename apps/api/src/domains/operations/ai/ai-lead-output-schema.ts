import { LEAD_AD_CLASSES } from '@telegram-system/shared';
const text = (maxLength: number) => ({ type: 'string', maxLength });
const strings = (maxItems: number, maxLength: number) => ({
  type: 'array',
  maxItems,
  items: text(maxLength),
});
const shape = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
export const AI_LEAD_CLASSIFICATION_SCHEMA = shape({
  classification: { type: 'string', enum: [...LEAD_AD_CLASSES] },
  commercialIntent: { type: 'boolean' },
  niche: text(300),
  offerType: text(300),
  hasContact: { type: 'boolean' },
  relevance: {
    type: 'string',
    enum: ['RELEVANT', 'POSSIBLE', 'NOT_RELEVANT', 'UNKNOWN'],
  },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  risks: strings(10, 100),
  evidence: {
    type: 'array',
    maxItems: 12,
    items: {
      type: 'string',
      pattern: '^e(?:[1-9][0-9]?|100)$',
      maxLength: 4,
      description:
        'Only an ID from supplied evidenceOptions; never source text or paraphrases.',
    },
  },
});
export const AI_LEAD_EXTRACTION_SCHEMA = shape({
  projectName: text(300),
  productName: text(300),
  contacts: {
    type: 'array',
    maxItems: 12,
    items: shape({
      type: {
        type: 'string',
        enum: ['TELEGRAM', 'INSTAGRAM', 'WEBSITE', 'PUBLIC_BUSINESS_CONTACT'],
      },
      value: text(300),
      role: {
        type: 'string',
        enum: [
          'ADVERTISED_DESTINATION',
          'ADVERTISER',
          'SALES_CONTACT',
          'AGENCY',
          'UNKNOWN',
        ],
      },
      evidence: text(300),
    }),
  },
  warnings: strings(10, 200),
});

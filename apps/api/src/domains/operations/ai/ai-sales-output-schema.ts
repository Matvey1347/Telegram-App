import {
  CRM_COPILOT_ACTIONS,
  CRM_COPILOT_TONES,
} from '@telegram-system/shared';

const shortText = (maxLength: number) => ({ type: 'string', maxLength });
const strings = (maxItems: number, maxLength: number) => ({
  type: 'array',
  maxItems,
  items: shortText(maxLength),
});
/** Fixed, versioned transport contract. CRM separately verifies referenced facts. */
export const AI_SALES_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'suggestedMessage',
    'reasoningSummary',
    'recommendedAction',
    'customerIntent',
    'confidence',
    'usedFacts',
    'missingFacts',
    'warnings',
    'requiresHumanReview',
    'language',
    'tone',
    'contextVersion',
  ],
  properties: {
    suggestedMessage: shortText(3000),
    reasoningSummary: shortText(700),
    recommendedAction: { type: 'string', enum: [...CRM_COPILOT_ACTIONS] },
    customerIntent: shortText(200),
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    usedFacts: strings(40, 160),
    missingFacts: strings(12, 300),
    warnings: strings(12, 300),
    requiresHumanReview: { type: 'boolean', enum: [true] },
    language: { type: 'string', enum: ['uk', 'ru', 'en'] },
    tone: { type: 'string', enum: [...CRM_COPILOT_TONES] },
    contextVersion: { type: 'string', minLength: 1, maxLength: 80 },
  },
};

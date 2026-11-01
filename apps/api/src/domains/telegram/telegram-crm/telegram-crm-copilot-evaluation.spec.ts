import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  CrmCopilotCategory,
  CrmCopilotGenerateInput,
  CrmCopilotOutput,
  CrmCopilotTone,
  CrmPackageProduct,
} from '@telegram-system/shared';
import { AiModelRegistry } from '../../operations/ai/ai-model-registry';
import type { CopilotContext } from './telegram-crm-copilot-context.service';
import {
  assertCopilotEligibility,
  copilotTextWarnings,
  validateCopilotOutput,
} from './telegram-crm-copilot-policy';

type Scenario = {
  id: string;
  category: CrmCopilotCategory;
  tone: CrmCopilotTone;
  language: 'uk' | 'ru' | 'en';
  criteria: string[];
  humanRubric: string[];
};
const dataset = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../../../docs/qa/ai-sales-copilot/evaluation-scenarios.json',
    ),
    'utf8',
  ),
) as { scenarios: Scenario[] };
const registry = new AiModelRegistry();
const product: CrmPackageProduct = {
  id: 'selected-product',
  name: 'Placement',
  channel: { id: 'channel', title: 'Psychology' },
  pricingMode: 'FIXED',
  fixedPrice: '800',
  cpm: null,
  minimumPrice: '700',
  currency: 'UAH',
  quoteRequired: false,
  topDurationMinutes: 60,
  feedDurationHours: 24,
  deleteAfterHours: 24,
  isPermanent: false,
  updatedAt: '2026-10-31T00:00:00Z',
  constraints: null,
};
const context = (): CopilotContext => ({
  conversationId: 'conversation',
  contactId: 'client',
  contactName: 'Synthetic client',
  workspaceId: 'workspace',
  processingEnabled: true,
    processingReference: 'policy:approved',
  canGenerate: true,
  blockedReason: null,
  facts: [
    {
      id: 'product:selected-product',
      kind: 'PRODUCT',
      text: JSON.stringify(product),
    },
  ],
  missingFacts: ['PACKAGE_PRICE_REQUIRES_MANAGER_QUOTE'],
  warnings: ['MANAGER_APPROVAL_REQUIRED'],
  contextVersion: 'version',
  products: [product],
  identityVersion: 'identity',
  followUpAllowed: true,
});
const input = (scenario: Scenario): CrmCopilotGenerateInput => ({
  operationId: '2026-10-31:d849a7bf-4d25-46d7-a5bc-ff052e9c28f3',
  category: scenario.category,
  tone: scenario.tone,
  language: scenario.language,
  productIds: [product.id],
  includeNotes: false,
  processingBasis: 'APPROVED_BUSINESS_PROCESSING',
  processingReference: 'policy:synthetic-fixture',
  sourceAcknowledged: true,
});
const output = (scenario: Scenario): CrmCopilotOutput => ({
  suggestedMessage:
    scenario.language === 'ru'
      ? 'Здравствуйте! Могу уточнить условия размещения?'
      : scenario.language === 'en'
        ? 'Hello! May I clarify the placement terms?'
        : 'Вітаю! Можу уточнити умови розміщення?',
  reasoningSummary: 'Do not persist untrusted private source excerpts',
  recommendedAction: 'CLARIFY',
  customerIntent: 'Clarify terms',
  confidence: 0.7,
  usedFacts: ['product:selected-product'],
  missingFacts: [],
  warnings: [],
  requiresHumanReview: true,
  language: scenario.language,
  tone: scenario.tone,
  contextVersion: 'version',
});

describe('reproducible synthetic Copilot evaluation matrix (not a live model quality score)', () => {
  it('contains at least40 distinct cases and an explicit human business-quality rubric', () => {
    expect(dataset.scenarios.length).toBeGreaterThanOrEqual(40);
    expect(new Set(dataset.scenarios.map((row) => row.id)).size).toBe(
      dataset.scenarios.length,
    );
    expect(
      dataset.scenarios.every(
        (row) => row.humanRubric.length >= 9 && row.criteria.length > 0,
      ),
    ).toBe(true);
  });
  it.each(dataset.scenarios)(
    '$id: deterministic schema/source or eligibility boundary',
    (scenario) => {
      const current = context(),
        request = input(scenario),
        result = output(scenario);
      if (
        scenario.id.startsWith('dnc-') ||
        ['closed-follow', 'archived-client'].includes(scenario.id)
      ) {
        current.canGenerate = false;
        current.blockedReason = scenario.id.startsWith('dnc-')
          ? 'DO_NOT_CONTACT'
          : 'INACTIVE';
        expect(() => assertCopilotEligibility(current, request)).toThrow();
        return;
      }
      if (['follow-no-task', 'follow-after-refusal'].includes(scenario.id)) {
        current.followUpAllowed = false;
        expect(() => assertCopilotEligibility(current, request)).toThrow(
          'COPILOT_FOLLOW_UP_NOT_ALLOWED',
        );
        return;
      }
      if (scenario.id === 'privacy-unapproved') {
        current.processingEnabled = false;
        expect(() => assertCopilotEligibility(current, request)).toThrow(
          'COPILOT_PROCESSING_BASIS_REQUIRED',
        );
        return;
      }
      expect(registry.validate(scenario.category, result)).toBe(true);
      expect(
        validateCopilotOutput(result, current, request).requiresHumanReview,
      ).toBe(true);
      expect(() =>
        validateCopilotOutput(
          { ...result, usedFacts: ['foreign:unverified'] },
          current,
          request,
        ),
      ).toThrow('COPILOT_OUTPUT_FACTS_INVALID');
      expect(
        validateCopilotOutput(result, current, request).warnings,
      ).toContain('MANAGER_APPROVAL_REQUIRED');
    },
  );
  it.each([
    ['Пакет коштує 800 UAH.', 'PACKAGE_TOTAL_NOT_VERIFIED'],
    ['I will confirm the price is free.', 'UNAPPROVED_FREE_PLACEMENT'],
    ['Уточню ціну: безкоштовно.', 'UNAPPROVED_FREE_PLACEMENT'],
    ['Ціна 900 UAH.', 'PRICE_NOT_VERIFIED'],
    ['Ціна 800 USD.', 'PRICE_NOT_VERIFIED'],
    ['Ціна 800.', 'NUMERIC_ASSERTION_REQUIRES_VERIFICATION'],
    ['Гарантуємо conversion.', 'UNVERIFIED_COMMERCIAL_ASSERTION'],
    ['Запропоную discount.', 'UNVERIFIED_COMMERCIAL_ASSERTION'],
    ['Вартість CPM 40USD.', 'UNVERIFIED_COMMERCIAL_ASSERTION'],
    ['Охоплення 100000.', 'NUMERIC_ASSERTION_REQUIRES_VERIFICATION'],
  ])('blocks unproven commercial assertion: %s', (text, warning) => {
    expect(copilotTextWarnings(text, context())).toContain(warning);
  });
  it('allows a natural clarification without exempting a later unverified assertion', () => {
    const current = context();
    expect(
      copilotTextWarnings(
        'Вітаю! Можу уточнити актуальну ціну розміщення у менеджера.',
        current,
      ),
    ).toEqual([]);
    expect(
      copilotTextWarnings(
        'Вітаю! Уточню ціну у менеджера. Пакет коштує тисячу.',
        current,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      copilotTextWarnings(
        'I will confirm the price with the manager. The package costs eight hundred dollars.',
        current,
      ).length,
    ).toBeGreaterThan(0);
  });
  it('accepts only the selected verified channel price and refuses it after a price change', () => {
    const current = context();
    expect(copilotTextWarnings('Placement — 800 UAH.', current)).toEqual([]);
    current.products = [{ ...product, fixedPrice: '950' }];
    expect(copilotTextWarnings('Placement — 800 UAH.', current)).toContain(
      'PRICE_NOT_VERIFIED',
    );
  });
  it('does not treat a selected CPM product as a flat price', () => {
    const current = context();
    current.products = [
      {
        ...product,
        pricingMode: 'CPM',
        fixedPrice: null,
        cpm: '800',
        quoteRequired: true,
      },
    ];
    expect(copilotTextWarnings('Placement — 800 UAH.', current)).toContain(
      'PRICE_NOT_VERIFIED',
    );
  });
});

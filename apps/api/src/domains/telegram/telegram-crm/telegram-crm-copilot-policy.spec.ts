import type {
  CrmCopilotGenerateInput,
  CrmCopilotOutput,
} from '@telegram-system/shared';
import type { CopilotContext } from './telegram-crm-copilot-context.service';
import {
  assertCopilotEligibility,
  copilotTextWarnings,
  persistedCopilotFacts,
  validateCopilotOutput,
} from './telegram-crm-copilot-policy';

const input: CrmCopilotGenerateInput = {
  operationId: '2026-10-31:00000000-0000-4000-8000-000000000000',
  category: 'SALES_REPLY_SUGGESTION',
  tone: 'NATURAL',
  language: 'uk',
  productIds: [],
  includeNotes: false,
  sourceAcknowledged: true,
  processingBasis: 'DOCUMENTED_CONSENT',
  processingReference: 'consent:record_1',
};
const context: CopilotContext = {
  workspaceId: 'ws',
  conversationId: 'conversation',
  contactId: 'contact',
  contactName: 'Client',
  processingEnabled: true,
    processingReference: 'policy:approved',
  canGenerate: true,
  blockedReason: null,
  facts: [{ id: 'client:contact', kind: 'CLIENT', text: 'Client' }],
  missingFacts: ['NO_PACKAGE_QUOTE'],
  warnings: [],
  contextVersion: 'stable-version',
  identityVersion: 'identity',
  followUpAllowed: true,
  products: [
    {
      id: 'product',
      name: 'Placement',
      channel: { id: 'channel', title: 'Channel' },
      pricingMode: 'FIXED',
      fixedPrice: '100.00',
      cpm: null,
      minimumPrice: null,
      currency: 'UAH',
      quoteRequired: false,
      topDurationMinutes: 60,
      feedDurationHours: 24,
      deleteAfterHours: null,
      isPermanent: false,
      updatedAt: '2026-10-31T00:00:00Z',
      constraints: null,
    },
  ],
};
const output: CrmCopilotOutput = {
  suggestedMessage: 'Дякую! Уточню деталі у менеджера.',
  reasoningSummary: 'Private transcript quote',
  recommendedAction: 'REPLY',
  customerIntent: 'Private transcript quote',
  confidence: 0.9,
  usedFacts: ['client:contact'],
  missingFacts: ['Private transcript quote'],
  warnings: ['Private transcript quote'],
  requiresHumanReview: true,
  language: 'uk',
  tone: 'NATURAL',
  contextVersion: 'stable-version',
};

describe('CRM Copilot policy and factual provenance', () => {
  it('requires deployment privacy gate plus explicit opaque human attestation', () => {
    expect(() => assertCopilotEligibility(context, input)).not.toThrow();
    expect(() =>
      assertCopilotEligibility({ ...context, processingEnabled: false }, input),
    ).toThrow('COPILOT_PROCESSING_BASIS_REQUIRED');
    expect(() =>
      assertCopilotEligibility(context, {
        ...input,
        sourceAcknowledged: false,
      }),
    ).toThrow();
    expect(() =>
      assertCopilotEligibility(context, {
        ...input,
        processingReference: 'I believe this is legal',
      }),
    ).toThrow();
  });
  it.each(['DO_NOT_CONTACT', 'CLOSED', 'INACTIVE', 'UNLINKED'])(
    'blocks ineligible %s before generation',
    (blockedReason) => {
      expect(() =>
        assertCopilotEligibility(
          { ...context, canGenerate: false, blockedReason },
          input,
        ),
      ).toThrow();
    },
  );
  it('requires actual active followup and permits no refusal outreach', () => {
    expect(() =>
      assertCopilotEligibility(
        { ...context, followUpAllowed: false },
        { ...input, category: 'SALES_FOLLOW_UP' },
      ),
    ).toThrow('COPILOT_FOLLOW_UP_NOT_ALLOWED');
    const refused = { ...context, warnings: ['RECENT_REFUSAL'] };
    expect(
      copilotTextWarnings(
        'Дякую за відповідь. Більше не турбуватиму.',
        refused,
      ),
    ).toEqual([]);
    expect(
      copilotTextWarnings('Дякую! Але купіть наш пакет.', refused),
    ).toContain('REFUSAL_ACKNOWLEDGEMENT_ONLY');
    expect(() => validateCopilotOutput(output, refused, input)).toThrow(
      'COPILOT_REFUSAL_ACTION_INVALID',
    );
  });
  it('accepts only current selected fixed-price/currency pairs and rejects package extrapolation', () => {
    expect(copilotTextWarnings('Placement: 100 UAH.', context)).toEqual([]);
    expect(copilotTextWarnings('Розміщення: 100 USD.', context)).toContain(
      'PRICE_NOT_VERIFIED',
    );
    expect(copilotTextWarnings('Пакет: 100 UAH.', context)).toContain(
      'PACKAGE_TOTAL_NOT_VERIFIED',
    );
    expect(copilotTextWarnings('Ціна 50.', context)).toContain(
      'NUMERIC_ASSERTION_REQUIRES_VERIFICATION',
    );
    expect(
      copilotTextWarnings('Placement: 100 UAH.', { ...context, products: [] }),
    ).toContain('PRICE_NOT_VERIFIED');
  });
  it.each([
    'Знижка 10%',
    'Гарантовано отримайте продажі',
    'CPM 5 USD',
    'Вільні дати 12.11',
    'Отримаєте нових клієнтів',
    'Пакет коштує сто євро.',
    'Комплект коштує 100 ₴',
    'Package costs eight hundred dollars',
    'За весь комплект — тисяча.',
    'За весь комплект — двісті.',
    'Пакет коштує тисячу. Уточню у менеджера.',
  ])('requires review for unsupported claim %s', (text) => {
    expect(copilotTextWarnings(text, context).length).toBeGreaterThan(0);
  });
  it('requires server fact IDs and exact version, language and tone', () => {
    for (const invalid of [
      { usedFacts: ['invented:fact'] },
      { contextVersion: 'stale' },
      { language: 'en' },
      { tone: 'DIRECT' },
    ])
      expect(() =>
        validateCopilotOutput({ ...output, ...invalid }, context, input),
      ).toThrow('COPILOT_OUTPUT_FACTS_INVALID');
  });
  it('stores references and server explanations without private transcript duplication', () => {
    expect(
      persistedCopilotFacts([
        { id: 'message:1', kind: 'MESSAGE', text: 'private source' },
        { id: 'note:1', kind: 'NOTE', text: 'private note' },
      ]).map((fact) => fact.text),
    ).toEqual(['Private message reference', 'Private note reference']);
    const privateText =
      'Private transcript excerpt copied from the customer conversation';
    const validated = validateCopilotOutput(
      {
        ...output,
        reasoningSummary: privateText,
        customerIntent: privateText,
        missingFacts: [privateText],
      },
      {
        ...context,
        facts: [
          ...context.facts,
          {
            id: 'message:private',
            kind: 'MESSAGE',
            text: JSON.stringify({ text: privateText }),
          },
        ],
      },
      input,
    );
    expect(JSON.stringify(validated)).not.toContain(privateText);
    expect(
      validateCopilotOutput(
        {
          ...output,
          reasoningSummary:
            'The customer asks for information; clarify the package quote with a manager.',
          customerIntent: 'Requested pricing',
        },
        context,
        input,
      ).reasoningSummary,
    ).toContain('clarify the package quote');
    expect(validated.requiresHumanReview).toBe(true);
    expect(validated.warnings).toContain('MANAGER_APPROVAL_REQUIRED');
  });
});

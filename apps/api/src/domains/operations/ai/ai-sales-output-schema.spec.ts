import {
  CRM_COPILOT_CATEGORIES,
  type CrmCopilotOutput,
} from '@telegram-system/shared';
import { AiModelRegistry } from './ai-model-registry';
import { operationFingerprint } from './ai-admission.service';

const output: CrmCopilotOutput = {
  suggestedMessage: 'Вітаю! Можу уточнити умови пакетного розміщення?',
  reasoningSummary: 'Ціна пакета ще не підтверджена.',
  recommendedAction: 'CLARIFY',
  customerIntent: 'Дізнатися умови',
  confidence: 0.7,
  usedFacts: ['client:name'],
  missingFacts: ['PACKAGE_PRICE'],
  warnings: ['MANAGER_APPROVAL_REQUIRED'],
  requiresHumanReview: true,
  language: 'uk',
  tone: 'NATURAL',
  contextVersion: 'context-hash',
};
const registry = new AiModelRegistry();
describe('versioned Sales transport contracts', () => {
  it.each(CRM_COPILOT_CATEGORIES)(
    'validates %s and records the new prompt/schema version',
    (category) => {
      expect(registry.validate(category, output)).toBe(true);
      expect(registry.schema(category).id).toBe(
        `${category.toLowerCase()}_copilot_v1`,
      );
      expect(registry.category(category).promptVersion).toBe(
        'sales-copilot-v1',
      );
      expect(registry.category(category).enabled).toBe(false);
    },
  );
  it.each([
    { ...output, requiresHumanReview: false },
    { ...output, usedFacts: ['x'.repeat(161)] },
    { ...output, suggestedMessage: 'x'.repeat(3001) },
    { ...output, recommendedAction: 'SEND_AUTOMATICALLY' },
    { ...output, confidence: 1.2 },
    { ...output, secret: 'must not escape' },
    { message: 'legacy schema', rationale: 'wrong version' },
  ])('rejects unsafe or unbounded output %#', (value) => {
    expect(registry.validate('SALES_REPLY_SUGGESTION', value)).toBe(false);
  });
  it('preserves Lead and Support schema isolation', () => {
    expect(registry.validate('SUPPORT_ASSISTANT', output)).toBe(false);
    expect(
      registry.validate('SUPPORT_ASSISTANT', {
        reply: 'Hello',
        requiresHuman: true,
      }),
    ).toBe(true);
    expect(registry.schema('LEAD_QUALIFICATION').id).toBe(
      'lead_qualification_qualification_v1',
    );
  });
  it('includes trusted instruction version in operation deduplication', () => {
    const request = {
      userId: 'u',
      workspaceId: 'w',
      category: 'SALES_FIRST_DRAFT' as const,
      operationId: '2026-10-31:0c277f3a-5941-4671-b773-0bd08eb0a95c',
      mode: 'MANUAL' as const,
      input: 'untrusted context',
    };
    expect(
      operationFingerprint({ ...request, instructions: 'policy-v1' }),
    ).not.toBe(operationFingerprint({ ...request, instructions: 'policy-v2' }));
  });
});

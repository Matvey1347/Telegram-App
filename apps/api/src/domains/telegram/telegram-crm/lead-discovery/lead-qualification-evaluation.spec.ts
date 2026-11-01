import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  LeadQualificationOutput,
  CrmCopilotTone,
} from '@telegram-system/shared';
import { AiModelRegistry } from '../../../operations/ai/ai-model-registry';
import { copilotTextWarnings } from '../telegram-crm-copilot-policy';
import {
  defaultLeadScorePolicy,
  parseLeadScorePolicy,
  scoreLeadQualification,
  validateLeadQualification,
  type LeadScoreFacts,
} from './lead-qualification-policy';
type Scenario = {
  id: string;
  text: string;
  facts: LeadScoreFacts;
  mockQualification: LeadQualificationOutput;
  mockDraft: string;
  tone: CrmCopilotTone;
  criteria: string[];
  humanRubric: string[];
  expected: {
    riskLevel: string;
    scoreStatus: string;
    recommendation: string | null;
    warning: string | null;
    invalidEvidence: boolean;
  };
};
const dataset = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../../../../docs/qa/ai-lead-qualification/evaluation-scenarios.json',
    ),
    'utf8',
  ),
) as {
  synthetic: boolean;
  modelQualityApproved: boolean;
  scenarios: Scenario[];
};
describe('offline synthetic qualification / outreach policy evaluation (no provider)', () => {
  it('has at least fifty distinct review scenarios and never self-attests real model quality', () => {
    expect(dataset.scenarios.length).toBeGreaterThanOrEqual(50);
    expect(new Set(dataset.scenarios.map((row) => row.id)).size).toBe(
      dataset.scenarios.length,
    );
    expect(dataset.synthetic).toBe(true);
    expect(dataset.modelQualityApproved).toBe(false);
    expect(
      dataset.scenarios.every(
        (row) => row.criteria.length >= 10 && row.humanRubric.length >= 9,
      ),
    ).toBe(true);
  });
  it.each(dataset.scenarios)(
    '$id: bounded schema, literal evidence, explainable scores and commercial text guard',
    (scenario) => {
      const output = structuredClone(scenario.mockQualification);
      const registry = new AiModelRegistry();
      expect(registry.validate('LEAD_QUALIFICATION', output)).toBe(true);
      expect(
        registry.validate('LEAD_QUALIFICATION', {
          ...output,
          purchaseProbability: 0.99,
        }),
      ).toBe(false);
      if (scenario.expected.invalidEvidence) {
        if (scenario.id === 'fabricated-evidence-id')
          output.reasons[0].observationId = 'foreign-evidence';
        else
          output.reasons[0].quote =
            'Invented text absent from the permitted material';
        expect(() =>
          validateLeadQualification(output, [
            { id: `evidence-${scenario.id}`, text: scenario.text },
          ]),
        ).toThrow('LEAD_QUALIFICATION_EVIDENCE_INVALID');
        return;
      }
      expect(
        validateLeadQualification(output, [
          { id: `evidence-${scenario.id}`, text: scenario.text },
        ]),
      ).toEqual(output);
      const score = scoreLeadQualification(output, scenario.facts);
      expect(score.riskLevel).toBe(scenario.expected.riskLevel);
      expect(score.status).toBe(scenario.expected.scoreStatus);
      if (scenario.expected.recommendation)
        expect(score.recommendation).toBe(scenario.expected.recommendation);
      if (score.status === 'INSUFFICIENT_EVIDENCE')
        expect(score.overall).toBeNull();
      else {
        expect(score.overall).toBeGreaterThanOrEqual(0);
        expect(score.overall).toBeLessThanOrEqual(100);
      }
      expect(
        score.factors.reduce((sum, factor) => sum + factor.maximum, 0),
      ).toBe(100);
      const warnings = copilotTextWarnings(scenario.mockDraft, {
        products: [],
        warnings: [],
        facts: [],
        missingFacts: ['CURRENT_PACKAGE_QUOTE'],
        contextVersion: 'synthetic-context',
      });
      if (scenario.expected.warning)
        expect(warnings).toContain(scenario.expected.warning);
    },
  );
  it('versioned policy rejects hidden weight changes and tests an explicit new weighting', () => {
    expect(() =>
      parseLeadScorePolicy(JSON.stringify(defaultLeadScorePolicy)),
    ).toThrow();
    expect(() =>
      parseLeadScorePolicy(
        JSON.stringify({
          ...defaultLeadScorePolicy,
          version: 'reviewed-v2',
          weights: { ...defaultLeadScorePolicy.weights, relevance: 99 },
        }),
      ),
    ).toThrow();
    const configured = parseLeadScorePolicy(
      JSON.stringify({ ...defaultLeadScorePolicy, version: 'reviewed-v2' }),
    );
    expect(configured.version).toBe('reviewed-v2');
    expect(
      scoreLeadQualification(
        dataset.scenarios[0].mockQualification,
        dataset.scenarios[0].facts,
        configured,
      ),
    ).toEqual(
      scoreLeadQualification(
        dataset.scenarios[0].mockQualification,
        dataset.scenarios[0].facts,
      ),
    );
  });
});

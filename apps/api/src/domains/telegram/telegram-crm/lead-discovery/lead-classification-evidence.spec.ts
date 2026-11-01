import type { LeadClassification } from '@telegram-system/shared';
import { addLeadFailure } from './lead-analysis-failure';
import {
  leadClassificationSource,
  mapLeadClassificationEvidence,
} from './lead-classification-evidence';

const classified = {
  classification: 'ADVERTISEMENT',
  evidence: ['e1'],
} as LeadClassification;
describe('server-owned classification evidence', () => {
  it('covers Unicode source text exactly once with stable bounded IDs and no split code points', () => {
    const text = 'Психологія 💙\nЦе справжній фрагмент. '.repeat(90);
    const first = leadClassificationSource(text);
    expect(first.truncated).toBe(false);
    expect(first.options.map((option) => option.text).join('')).toBe(text);
    expect(first).toEqual(leadClassificationSource(text));
    first.options.forEach((option, index) => {
      expect(option.id).toBe(`e${index + 1}`);
      expect(option.text.length).toBeLessThanOrEqual(180);
      expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(option.text)).toBe(false);
      expect(text.includes(option.text)).toBe(true);
    });
    const output = mapLeadClassificationEvidence(
      { ...classified, evidence: ['e2', 'e1', 'e2'] },
      first.options,
    );
    expect(output.evidence).toEqual([
      first.options[1].text,
      first.options[0].text,
    ]);
  });
  it.each(['e99', 'invented paraphrase', 'e0'])(
    'rejects unprovided evidence %s rather than accepting fuzzy quotations',
    (id) => {
      const source = leadClassificationSource('Literal public business text.');
      expect(() =>
        mapLeadClassificationEvidence(
          { ...classified, evidence: [id] },
          source.options,
        ),
      ).toThrow('LEAD_CLASSIFICATION_EVIDENCE_ID_INVALID');
    },
  );
  it('does not accept an advertisement without supporting evidence and permits a truthful unknown', () => {
    const source = leadClassificationSource('Uncertain statement.');
    expect(() =>
      mapLeadClassificationEvidence(
        { ...classified, evidence: [] },
        source.options,
      ),
    ).toThrow('LEAD_CLASSIFICATION_EVIDENCE_REQUIRED');
    expect(
      mapLeadClassificationEvidence(
        { ...classified, classification: 'UNKNOWN', evidence: [] },
        source.options,
      ).evidence,
    ).toEqual([]);
  });
  it('reports source truncation instead of silently treating a prefix as the complete source', () => {
    const source = leadClassificationSource('x'.repeat(18001));
    expect(source.truncated).toBe(true);
    expect(source.options).toHaveLength(100);
    expect(source.options.map((option) => option.text).join('')).toHaveLength(
      18000,
    );
  });
  it('returns only bounded safe reason codes and never exception/provider text', () => {
    const summary = {
      analyzed: 0,
      extracted: 0,
      skipped: 0,
      unknown: 0,
      failed: 1,
    };
    addLeadFailure(
      summary,
      'observation',
      'classification',
      new Error('LEAD_CLASSIFICATION_EVIDENCE_ID_INVALID'),
    );
    for (let index = 0; index < 20; index++)
      addLeadFailure(
        summary,
        'observation',
        'extraction',
        new Error('Private customer/provider error text'),
      );
    expect(summary).toMatchObject({
      failures: expect.arrayContaining([
        {
          observationId: 'observation',
          stage: 'classification',
          code: 'LEAD_CLASSIFICATION_EVIDENCE_ID_INVALID',
        },
      ]) as unknown,
    });
    expect(JSON.stringify(summary)).not.toContain('Private customer');
    expect((summary as { failures?: unknown[] }).failures).toHaveLength(10);
  });
});

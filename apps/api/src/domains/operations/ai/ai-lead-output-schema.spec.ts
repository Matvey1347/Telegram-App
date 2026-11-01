import { AiModelRegistry } from './ai-model-registry';
const registry = new AiModelRegistry();
const classified = {
  classification: 'ADVERTISEMENT',
  commercialIntent: true,
  niche: 'education',
  offerType: 'course',
  hasContact: true,
  relevance: 'POSSIBLE',
  confidence: 0.7,
  risks: [],
  evidence: ['Public business contact stated'],
};
const extracted = {
  projectName: 'Synthetic project',
  productName: 'Course',
  contacts: [
    {
      type: 'TELEGRAM',
      value: '@business_example',
      role: 'SALES_CONTACT',
      evidence: 'Contact @business_example',
    },
  ],
  warnings: [],
};
describe('Lead Discovery strict transport contracts', () => {
  it('versions Discovery and Qualification independently while preserving Sales', () => {
    expect(registry.schema('LEAD_AD_CLASSIFICATION').id).toBe(
      'lead_ad_classification_discovery_v1',
    );
    expect(registry.schema('LEAD_CONTACT_EXTRACTION').id).toBe(
      'lead_contact_extraction_discovery_v1',
    );
    expect(registry.category('LEAD_AD_CLASSIFICATION').promptVersion).toBe(
      'lead-discovery-v1',
    );
    expect(registry.schema('LEAD_QUALIFICATION').id).toBe(
      'lead_qualification_qualification_v1',
    );
    expect(registry.schema('SALES_FIRST_DRAFT').id).toBe(
      'sales_first_draft_copilot_v1',
    );
    expect(registry.validate('SUPPORT_ASSISTANT', classified)).toBe(false);
  });
  it.each(['ADVERTISEMENT', 'MUTUAL_PROMOTION', 'ORGANIC_CONTENT', 'UNKNOWN'])(
    'allows a truthful %s classification without assuming paid advertising',
    (classification) => {
      expect(
        registry.validate('LEAD_AD_CLASSIFICATION', {
          ...classified,
          classification,
        }),
      ).toBe(true);
    },
  );
  it.each([
    { ...classified, paid: true },
    { ...classified, classification: 'PAID_AD' },
    { ...classified, confidence: 2 },
    { ...classified, risks: Array(11).fill('risk') },
    { ...classified, evidence: ['x'.repeat(201)] },
  ])('rejects unapproved fields and unbounded model assertions %#', (value) => {
    expect(registry.validate('LEAD_AD_CLASSIFICATION', value)).toBe(false);
  });
  it('keeps extracted destination/contact roles separate and never lets AI mark a contact human-confirmed', () => {
    expect(registry.validate('LEAD_CONTACT_EXTRACTION', extracted)).toBe(true);
    expect(
      registry.validate('LEAD_CONTACT_EXTRACTION', {
        ...extracted,
        contacts: [{ ...extracted.contacts[0], confirmed: true }],
      }),
    ).toBe(false);
    expect(
      registry.validate('LEAD_CONTACT_EXTRACTION', {
        ...extracted,
        contacts: Array(13).fill(extracted.contacts[0]),
      }),
    ).toBe(false);
  });
});

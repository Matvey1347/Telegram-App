const text = (maxLength: number) => ({ type: 'string', maxLength });
const shape = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const enumText = (values: string[]) => ({ type: 'string', enum: values });
const evidence = {
  observationId: text(100),
  quote: text(200),
  reason: text(300),
};
export const AI_LEAD_QUALIFICATION_SCHEMA = shape({
  relevance: enumText(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']),
  thematicFit: enumText(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']),
  advertiserIdentity: enumText([
    'CONFIRMED',
    'AMBIGUOUS',
    'AGENCY',
    'DESTINATION',
    'UNKNOWN',
  ]),
  evidenceQuality: enumText(['STRONG', 'PARTIAL', 'INSUFFICIENT']),
  recommendedOffer: text(500),
  reasons: { type: 'array', maxItems: 8, items: shape(evidence) },
  riskSignals: {
    type: 'array',
    maxItems: 8,
    items: shape({
      ...evidence,
      code: enumText([
        'GUARANTEED_RETURNS',
        'FINANCIAL_GUARANTEE',
        'CONTRADICTION',
        'SUSPICIOUS_LINK',
        'OPAQUE_OFFER',
        'PROHIBITED_CATEGORY',
        'INSUFFICIENT_DATA',
      ]),
      level: enumText(['RISK_LOW', 'RISK_MEDIUM', 'RISK_HIGH', 'RISK_UNKNOWN']),
    }),
  },
  missingFacts: { type: 'array', maxItems: 10, items: text(200) },
});

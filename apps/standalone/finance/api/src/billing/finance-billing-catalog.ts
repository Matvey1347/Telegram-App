// CommonJS loading works in both Nest's production bundle and ts-jest.
const catalog = require('./finance-billing-offers.json');
export type FinancePlusOffer = 'INTRO' | 'MONTH' | 'QUARTER' | 'YEAR';
type OfferDefinition = { amountMinor: number; interval: 'day' | 'month' | 'year'; intervalCount: number; intervalLabel: string; introNextAmountMinor?: number };
export const FINANCE_PLUS_OFFERS = catalog as Record<FinancePlusOffer, OfferDefinition>;

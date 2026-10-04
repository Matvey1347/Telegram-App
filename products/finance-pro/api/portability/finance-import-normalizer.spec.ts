import { normalizeFinanceImportDocument } from './finance-import-normalizer';
import { validateFinanceImportDocument } from './finance-import-validator';

function document() {
  return {
    format: 'telegram-system.consumer-finance',
    version: 1,
    mode: 'ADD',
    data: {
      accounts: [{ ref: 'cash', name: 'Cash', type: 'CASH', currency: 'USD' }],
      investments: [
        {
          ref: 'asset',
          name: 'Asset',
          type: 'OTHER',
          currency: 'USD',
          status: 'CLOSED',
          startedAt: '2025-02-01T00:00:00.000Z',
          closedAt: '2025-03-01T00:00:00.000Z',
        },
      ],
      investmentCashFlows: [
        {
          ref: 'contribution',
          investmentRef: 'asset',
          accountRef: 'cash',
          kind: 'CONTRIBUTION',
          amount: '100',
          occurredAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      investmentValuations: [
        {
          ref: 'valuation',
          investmentRef: 'asset',
          value: '120',
          valuedAt: '2025-04-01T00:00:00.000Z',
        },
      ],
    },
  };
}

describe('normalizeFinanceImportDocument', () => {
  it('expands investment boundaries to retain every historical event', () => {
    const source = document();
    const normalized = normalizeFinanceImportDocument(source);
    const result = validateFinanceImportDocument(normalized.input);

    expect(result.data.investments?.[0]).toEqual(
      expect.objectContaining({
        startedAt: '2025-01-01T00:00:00.000Z',
        closedAt: '2025-04-01T00:00:00.000Z',
      }),
    );
    expect(normalized.warnings).toHaveLength(2);
    expect(source.data.investments[0]).toEqual(
      expect.objectContaining({
        startedAt: '2025-02-01T00:00:00.000Z',
        closedAt: '2025-03-01T00:00:00.000Z',
      }),
    );
  });

  it('derives a missing closing date for a closed investment', () => {
    const source = document();
    delete (source.data.investments[0] as { closedAt?: string }).closedAt;

    const normalized = normalizeFinanceImportDocument(source);
    const result = validateFinanceImportDocument(normalized.input);

    expect(result.data.investments?.[0].closedAt).toBe(
      '2025-04-01T00:00:00.000Z',
    );
  });

  it('expands an archived investment closing boundary when it is present', () => {
    const source = document();
    source.data.investments[0].status = 'ARCHIVED';

    const normalized = normalizeFinanceImportDocument(source);
    const result = validateFinanceImportDocument(normalized.input);

    expect(result.data.investments?.[0].closedAt).toBe(
      '2025-04-01T00:00:00.000Z',
    );
  });

  it('leaves malformed input for the strict validator to reject', () => {
    const normalized = normalizeFinanceImportDocument({ data: 'invalid' });

    expect(() => validateFinanceImportDocument(normalized.input)).toThrow();
    expect(normalized.warnings).toEqual([]);
  });
});

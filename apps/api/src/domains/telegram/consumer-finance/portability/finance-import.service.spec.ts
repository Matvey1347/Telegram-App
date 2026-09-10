import { BadRequestException } from '@nestjs/common';
import { FinanceImportService } from './finance-import.service';
import { prepareFinanceImportRates } from './finance-import-rates';
import { writeFinanceImport } from './finance-import-writer';

jest.mock('./finance-import-rates', () => ({
  prepareFinanceImportRates: jest.fn(),
}));
jest.mock('./finance-import-writer', () => ({
  writeFinanceImport: jest.fn(),
}));

const validDocument = {
  format: 'telegram-system.consumer-finance',
  version: 1,
  mode: 'ADD',
  data: {
    accounts: [{ ref: 'cash', name: 'Cash', type: 'CASH', currency: 'UAH' }],
  },
};

function setup() {
  const tx = {};
  const prisma = {
    financeDataImportReceipt: { findUnique: jest.fn() },
    financeProfile: { findUnique: jest.fn() },
    $transaction: jest.fn((action: (client: unknown) => unknown) => action(tx)),
  };
  const conversion = {};
  const delivery = { notify: jest.fn() };
  const presentation = {};
  const service = new FinanceImportService(
    prisma as never,
    conversion as never,
    delivery as never,
    presentation as never,
  );
  return { service, prisma, conversion, delivery, presentation, tx };
}

describe('FinanceImportService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stops before database or rate work when the document is invalid', async () => {
    const test = setup();

    await expect(
      test.service.import(
        'profile-1',
        { ...validDocument, mode: 'REPLACE' },
        jest.fn(),
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      test.prisma.financeDataImportReceipt.findUnique,
    ).not.toHaveBeenCalled();
    expect(prepareFinanceImportRates).not.toHaveBeenCalled();
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns an existing receipt without duplicating an exact file', async () => {
    const test = setup();
    test.prisma.financeDataImportReceipt.findUnique.mockResolvedValue({
      id: 'import-1',
      importedCount: 1,
      counts: { accounts: 1 },
      warnings: [],
    });

    await expect(
      test.service.import(
        'profile-1',
        validDocument,
        jest.fn(),
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      importId: 'import-1',
      duplicate: true,
      imported: 1,
      counts: { accounts: 1 },
      warnings: [],
    });
    expect(prepareFinanceImportRates).not.toHaveBeenCalled();
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prepares rates, writes atomically and wakes only after commit', async () => {
    const test = setup();
    const rateSource = { transactions: new Map() };
    const result = {
      importId: 'import-2',
      duplicate: false,
      imported: 1,
      counts: { accounts: 1 },
      warnings: [],
    };
    const early = new Date('2026-09-10T00:00:00.000Z');
    const late = new Date('2026-09-11T00:00:00.000Z');
    test.prisma.financeDataImportReceipt.findUnique.mockResolvedValue(null);
    test.prisma.financeProfile.findUnique.mockResolvedValue({
      defaultCurrency: 'USD',
      botIntegration: { workspaceId: 'workspace-1' },
    });
    jest
      .mocked(prepareFinanceImportRates)
      .mockResolvedValue(rateSource as never);
    jest.mocked(writeFinanceImport).mockResolvedValue({
      result,
      scheduledAt: [late, early],
    });

    await expect(
      test.service.import(
        'profile-1',
        validDocument,
        jest.fn(),
        new AbortController().signal,
      ),
    ).resolves.toBe(result);
    expect(test.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(writeFinanceImport).toHaveBeenCalledWith(
      expect.objectContaining({
        tx: test.tx,
        profileId: 'profile-1',
        rates: rateSource,
        delivery: test.delivery,
        presentation: test.presentation,
      }),
    );
    expect(test.delivery.notify).toHaveBeenCalledWith(early);
  });
});

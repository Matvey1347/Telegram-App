import { BadRequestException, ConflictException } from '@nestjs/common';
import { FinanceImportService } from './finance-import.service';
import { prepareFinanceImportRates } from './finance-import-rates';
import { writeFinanceImport } from './finance-import-writer';
import { financeDataSnapshot } from '../catalog/finance-portability';
import { encodeFinanceRollbackSnapshot } from './finance-portability-history';

jest.mock('./finance-import-rates', () => ({
  prepareFinanceImportRates: jest.fn(),
}));
jest.mock('./finance-import-writer', () => ({
  writeFinanceImport: jest.fn(),
}));
jest.mock('../catalog/finance-portability', () => ({
  financeDataSnapshot: jest.fn(),
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
  const tx = {
    $executeRaw: jest.fn(),
    financeProfile: { update: jest.fn() },
    financeDataImportReceipt: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    financeDataImportReceipt: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    financeDataExportReceipt: { findMany: jest.fn() },
    financeProfile: { findUnique: jest.fn() },
    $transaction: jest.fn((action: (client: unknown) => unknown) => action(tx)),
  };
  const conversion = {};
  const historicalRates = {};
  const delivery = { notify: jest.fn() };
  const presentation = {};
  const service = new FinanceImportService(
    prisma as never,
    conversion as never,
    historicalRates as never,
    delivery as never,
    presentation as never,
  );
  return {
    service,
    prisma,
    conversion,
    historicalRates,
    delivery,
    presentation,
    tx,
  };
}

describe('FinanceImportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(financeDataSnapshot).mockResolvedValue(validDocument as never);
  });

  it('stops before database or rate work when the import mode is invalid', async () => {
    const test = setup();

    await expect(
      test.service.import(
        'profile-1',
        { ...validDocument, mode: 'MERGE' },
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

  it('does not treat a replace import as a duplicate of an earlier replacement', async () => {
    const test = setup();
    test.prisma.financeProfile.findUnique.mockResolvedValue({
      defaultCurrency: 'USD',
      botIntegration: { workspaceId: 'workspace-1' },
    });
    jest.mocked(prepareFinanceImportRates).mockResolvedValue({} as never);
    jest.mocked(writeFinanceImport).mockResolvedValue({
      result: {
        importId: 'replacement',
        duplicate: false,
        imported: 1,
        counts: { accounts: 1 },
        warnings: ['Existing Finance data was replaced before import.'],
      },
      scheduledAt: [],
    });

    await test.service.import(
      'profile-1',
      { ...validDocument, mode: 'REPLACE' },
      jest.fn(),
      new AbortController().signal,
    );

    expect(
      test.prisma.financeDataImportReceipt.findUnique,
    ).not.toHaveBeenCalled();
    expect(test.prisma.$transaction).toHaveBeenCalledTimes(1);
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

  it('normalizes every investment timeline before rate and write work', async () => {
    const test = setup();
    const document = {
      format: 'telegram-system.consumer-finance',
      version: 1,
      mode: 'ADD',
      data: {
        accounts: [
          { ref: 'cash', name: 'Cash', type: 'CASH', currency: 'USD' },
        ],
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
    test.prisma.financeDataImportReceipt.findUnique.mockResolvedValue(null);
    test.prisma.financeProfile.findUnique.mockResolvedValue({
      defaultCurrency: 'USD',
      botIntegration: { workspaceId: 'workspace-1' },
    });
    jest.mocked(prepareFinanceImportRates).mockResolvedValue({} as never);
    jest.mocked(writeFinanceImport).mockResolvedValue({
      result: {
        importId: 'import-normalized',
        duplicate: false,
        imported: 4,
        counts: {},
        warnings: [],
      },
      scheduledAt: [],
    });

    await test.service.import(
      'profile-1',
      document,
      jest.fn(),
      new AbortController().signal,
    );

    const rateInput = jest.mocked(prepareFinanceImportRates).mock.calls[0]![0];
    expect(rateInput.document.data.investments?.[0]).toEqual(
      expect.objectContaining({
        startedAt: '2025-01-01T00:00:00.000Z',
        closedAt: '2025-04-01T00:00:00.000Z',
      }),
    );
    const writeInput = jest.mocked(writeFinanceImport).mock.calls[0]![0];
    expect(writeInput.initialWarnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('startedAt was moved'),
        expect.stringContaining('closedAt was set'),
      ]),
    );
  });

  it('returns profile-scoped import, rollback and export history without snapshots', async () => {
    const test = setup();
    test.prisma.financeDataImportReceipt.findMany.mockResolvedValue([
      {
        id: 'import-1',
        operation: 'IMPORT',
        mode: 'ADD',
        sourceFileName: 'finance.json',
        importedCount: 2,
        counts: { accounts: 1, transactions: 1 },
        createdAt: new Date('2026-09-14T12:00:00.000Z'),
        rollbackSnapshot: Buffer.from('snapshot'),
        rolledBackAt: null,
        rollbackOfId: null,
      },
    ]);
    test.prisma.financeDataExportReceipt.findMany.mockResolvedValue([
      {
        id: 'export-1',
        exportedCount: 2,
        counts: { accounts: 1, transactions: 1 },
        createdAt: new Date('2026-09-14T13:00:00.000Z'),
      },
    ]);

    await expect(test.service.history('profile-1')).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: 'export-1',
          operation: 'EXPORT',
          canRollback: false,
        }),
        expect.objectContaining({
          id: 'import-1',
          operation: 'IMPORT',
          sourceFileName: 'finance.json',
          canRollback: true,
        }),
      ],
    });
    expect(test.prisma.financeDataImportReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { profileId: 'profile-1' }, take: 50 }),
    );
  });

  it('restores a retained snapshot atomically and records the rollback', async () => {
    const test = setup();
    const stored = await encodeFinanceRollbackSnapshot(validDocument as never);
    test.prisma.financeDataImportReceipt.findFirst.mockResolvedValue({
      rollbackSnapshot: stored,
      rolledBackAt: null,
    });
    test.tx.financeDataImportReceipt.findFirst.mockResolvedValue({
      rollbackSnapshot: stored,
      rolledBackAt: null,
    });
    test.prisma.financeProfile.findUnique.mockResolvedValue({
      defaultCurrency: 'USD',
      botIntegration: { workspaceId: 'workspace-1' },
    });
    jest.mocked(prepareFinanceImportRates).mockResolvedValue({} as never);
    jest.mocked(writeFinanceImport).mockResolvedValue({
      result: {
        importId: 'rollback-1',
        duplicate: false,
        imported: 1,
        counts: { accounts: 1 },
        warnings: [],
      },
      scheduledAt: [],
    });

    await expect(
      test.service.rollback('profile-1', 'import-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        importId: 'rollback-1',
        restoredFromImportId: 'import-1',
      }),
    );
    expect(writeFinanceImport).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'ROLLBACK',
        rollbackOfId: 'import-1',
        document: expect.objectContaining({ mode: 'REPLACE' }),
        rollbackSnapshot: expect.any(Uint8Array),
      }),
    );
    expect(test.tx.financeDataImportReceipt.update).toHaveBeenCalledWith({
      where: { id: 'import-1' },
      data: { rolledBackAt: expect.any(Date), rollbackSnapshot: null },
    });
    expect(test.tx.financeProfile.update).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      data: { displayName: null },
    });
  });

  it('rejects rollback when its retained snapshot is unavailable', async () => {
    const test = setup();
    test.prisma.financeDataImportReceipt.findFirst.mockResolvedValue({
      rollbackSnapshot: null,
      rolledBackAt: null,
    });

    await expect(
      test.service.rollback('profile-1', 'old-import'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prepareFinanceImportRates).not.toHaveBeenCalled();
    expect(test.prisma.$transaction).not.toHaveBeenCalled();
  });
});

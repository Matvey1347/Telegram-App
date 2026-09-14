import type { ConsumerFinanceImportDocumentV1 } from '@telegram-system/shared';
import {
  decodeFinanceRollbackSnapshot,
  encodeFinanceRollbackSnapshot,
  financeDocumentCounts,
  financeDocumentRecordCount,
  pruneFinanceRollbackSnapshots,
} from './finance-portability-history';

const document: ConsumerFinanceImportDocumentV1 = {
  format: 'telegram-system.consumer-finance',
  version: 1,
  mode: 'ADD',
  data: {
    accounts: [{ ref: 'cash', name: 'Cash', type: 'CASH', currency: 'USD' }],
    transactions: [
      {
        ref: 'coffee',
        accountRef: 'cash',
        type: 'EXPENSE',
        amount: '5',
        occurredAt: '2026-09-14T12:00:00.000Z',
      },
    ],
  },
};

describe('consumer Finance portability history', () => {
  it('round-trips a compressed rollback snapshot and counts its records', async () => {
    const counts = financeDocumentCounts(document);

    expect(counts).toEqual({ accounts: 1, transactions: 1 });
    expect(financeDocumentRecordCount(counts)).toBe(2);
    const encoded = await encodeFinanceRollbackSnapshot(document);
    await expect(decodeFinanceRollbackSnapshot(encoded)).resolves.toEqual(
      document,
    );
  });

  it('retains only the five newest rollback payloads', async () => {
    const tx = {
      financeDataImportReceipt: {
        findMany: jest.fn().mockResolvedValue([{ id: 'old-1' }]),
        updateMany: jest.fn(),
      },
    };

    await pruneFinanceRollbackSnapshots(tx as never, 'profile-1');

    expect(tx.financeDataImportReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5 }),
    );
    expect(tx.financeDataImportReceipt.updateMany).toHaveBeenCalledWith({
      where: { profileId: 'profile-1', id: { in: ['old-1'] } },
      data: { rollbackSnapshot: null },
    });
  });
});

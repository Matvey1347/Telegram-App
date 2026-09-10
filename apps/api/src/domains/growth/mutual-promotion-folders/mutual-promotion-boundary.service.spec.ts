/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- focused Prisma transaction doubles */
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { MutualPromotionBoundaryService } from './mutual-promotion-boundary.service';

jest.mock('../../../prisma/postgres-advisory-lock', () => ({
  acquirePostgresTransactionLock: jest.fn().mockResolvedValue(undefined),
}));

describe('MutualPromotionBoundaryService', () => {
  const capturedAt = new Date('2026-09-10T08:00:00.000Z');

  function setup() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      mutualPromotionFolder: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      mutualPromotionFolderParticipant: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    return {
      service: new MutualPromotionBoundaryService(prisma as never),
      tx,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['captureStart', 'captureFinal'] as const)(
    'locks the folder before %s writes attribution boundaries',
    async (method) => {
      const { service, tx } = setup();

      await service[method]('folder-1', capturedAt);

      expect(acquirePostgresTransactionLock).toHaveBeenCalledWith(
        tx,
        'mutual-promotion-folder:folder-1',
      );
      expect(
        jest.mocked(acquirePostgresTransactionLock).mock.invocationCallOrder[0],
      ).toBeLessThan(
        method === 'captureStart'
          ? tx.$executeRaw.mock.invocationCallOrder[0]
          : tx.mutualPromotionFolder.updateMany.mock.invocationCallOrder[0],
      );
    },
  );
});

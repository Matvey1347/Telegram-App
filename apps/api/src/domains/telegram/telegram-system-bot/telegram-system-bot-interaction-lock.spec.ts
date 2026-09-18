import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { withSystemBotInteractionLock } from './telegram-system-bot-interaction-lock';

jest.mock('../../../prisma/postgres-advisory-lock', () => ({
  acquirePostgresTransactionLock: jest.fn().mockResolvedValue(undefined),
}));

describe('withSystemBotInteractionLock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the void-safe shared advisory lock before running transaction work', async () => {
    const tx = {};
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const work = jest.fn().mockResolvedValue('done');

    await expect(
      withSystemBotInteractionLock(
        prisma as never,
        { connectionId: 'connection-1', workspaceId: 'workspace-1' },
        work,
      ),
    ).resolves.toBe('done');

    expect(acquirePostgresTransactionLock).toHaveBeenCalledWith(
      tx,
      'connection-1:workspace-1',
    );
    expect(
      jest.mocked(acquirePostgresTransactionLock).mock.invocationCallOrder[0],
    ).toBeLessThan(work.mock.invocationCallOrder[0]);
  });
});

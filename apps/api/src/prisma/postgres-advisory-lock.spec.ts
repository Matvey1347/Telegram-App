import { acquirePostgresTransactionLock } from './postgres-advisory-lock';

describe('acquirePostgresTransactionLock', () => {
  it('executes the void-returning advisory lock without decoding query rows', async () => {
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1) };

    await acquirePostgresTransactionLock(tx as never, 'invite-1');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

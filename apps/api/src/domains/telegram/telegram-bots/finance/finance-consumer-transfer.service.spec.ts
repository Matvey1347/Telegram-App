import { ForbiddenException } from '@nestjs/common';
import { FinanceConsumerTransferService } from './finance-consumer-transfer.service';

describe('FinanceConsumerTransferService', () => {
  const session = {
    profileId: 'profile-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
    workspaceId: 'workspace-1',
    defaultCurrency: 'UAH',
  };

  function serviceFor(updateCount: number) {
    const tx = {
      financeConsumerTransfer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'transfer-1',
          profile: {
            id: 'profile-1', botIntegrationId: 'bot-1', telegramBotUserId: 'user-1', defaultCurrency: 'UAH',
            botIntegration: { workspaceId: 'workspace-1' }, telegramUser: { telegramChatId: '123' },
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      },
    };
    return { service: new FinanceConsumerTransferService({ $transaction: (fn: (value: typeof tx) => unknown) => fn(tx) } as never), tx };
  }

  it('creates only a hashed, short-lived credential', async () => {
    const create = jest.fn();
    const service = new FinanceConsumerTransferService({ financeConsumerTransfer: { create } } as never);
    const result = await service.create(session);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    expect(create.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
  });

  it('atomically consumes a transfer once and rejects a replay or expiry', async () => {
    const token = 'a'.repeat(43);
    const available = serviceFor(1);
    await expect(available.service.consume(token, 'bot-1')).resolves.toMatchObject(session);
    expect(available.tx.financeConsumerTransfer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ consumedAt: null, expiresAt: { gt: expect.any(Date) } }),
    }));
    await expect(serviceFor(0).service.consume(token, 'bot-1')).rejects.toThrow(ForbiddenException);
  });
});

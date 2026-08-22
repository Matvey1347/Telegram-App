import { ForbiddenException } from '@nestjs/common';
import { FinanceConsumerTransferService } from './finance-consumer-transfer.service';

describe('FinanceConsumerTransferService', () => {
  const session = {
    profileId: 'profile-1',
    botIntegrationId: 'bot-1',
    telegramBotUserId: 'user-1',
    telegramChatId: '123',
    workspaceId: 'workspace-1',
    defaultCurrency: 'UAH',
  };

  function serviceFor(updateCount: number) {
    const tx = {
      financeConsumerTransfer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'transfer-1',
          profile: {
            id: 'profile-1',
            botIntegrationId: 'bot-1',
            telegramBotUserId: 'user-1',
            defaultCurrency: 'UAH',
            botIntegration: { workspaceId: 'workspace-1' },
            telegramUser: { telegramChatId: '123' },
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
      },
    };
    return {
      service: new FinanceConsumerTransferService({
        $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
      } as never),
      tx,
    };
  }

  it('creates only a hashed, short-lived credential', async () => {
    const create = jest.fn();
    const service = new FinanceConsumerTransferService({
      financeConsumerTransfer: { create },
    } as never);
    const result = await service.create(session);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    expect(create.mock.calls[0][0].data.tokenHash).not.toBe(result.token);
  });

  it('atomically consumes a transfer once and rejects a replay or expiry', async () => {
    const token = 'a'.repeat(43);
    const available = serviceFor(1);
    await expect(
      available.service.consume(token, 'bot-1'),
    ).resolves.toMatchObject(session);
    expect(
      available.tx.financeConsumerTransfer.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consumedAt: null,
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    await expect(serviceFor(0).service.consume(token, 'bot-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('creates a hashed browser challenge with a Telegram deep link', async () => {
    const create = jest.fn();
    const deleteMany = jest.fn();
    const service = new FinanceConsumerTransferService({
      financeBrowserLoginChallenge: { create, deleteMany },
    } as never);

    const result = await service.createBrowserLogin('bot-1', '@finance_bot');

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{32}$/u);
    expect(result.loginUrl).toBe(
      `https://t.me/finance_bot?start=finlogin_${result.token}`,
    );
    expect(create.mock.calls[0][0].data).toMatchObject({
      botIntegrationId: 'bot-1',
      tokenHash: expect.not.stringMatching(result.token),
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        botIntegrationId: 'bot-1',
        expiresAt: { lte: expect.any(Date) },
      },
    });
  });

  it('approves a live browser challenge idempotently for the same profile', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findUnique = jest.fn().mockResolvedValue({
      botIntegrationId: 'bot-1',
      approvedProfileId: 'profile-1',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const service = new FinanceConsumerTransferService({
      financeBrowserLoginChallenge: { updateMany, findUnique },
    } as never);

    await expect(
      service.approveBrowserLogin({
        token: 'a'.repeat(32),
        botIntegrationId: 'bot-1',
        profileId: 'profile-1',
      }),
    ).resolves.toBe(true);
  });

  it('returns pending before approval and atomically consumes an approved challenge', async () => {
    const approvedProfile = {
      id: 'profile-1',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'user-1',
      defaultCurrency: 'UAH',
      botIntegration: { workspaceId: 'workspace-1' },
      telegramUser: { telegramChatId: '123' },
    };
    const transaction = (profile: typeof approvedProfile | null) => {
      const tx = {
        financeBrowserLoginChallenge: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'challenge-1',
            botIntegrationId: 'bot-1',
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
            approvedProfile: profile,
          }),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return {
        service: new FinanceConsumerTransferService({
          $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
        } as never),
        tx,
      };
    };

    await expect(
      transaction(null).service.consumeBrowserLogin('a'.repeat(32), 'bot-1'),
    ).resolves.toEqual({ status: 'pending' });
    const approved = transaction(approvedProfile);
    await expect(
      approved.service.consumeBrowserLogin('a'.repeat(32), 'bot-1'),
    ).resolves.toEqual({ status: 'approved', session });
    expect(
      approved.tx.financeBrowserLoginChallenge.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ consumedAt: null }),
      }),
    );

    const wrongBot = transaction({
      ...approvedProfile,
      botIntegrationId: 'other-bot',
    });
    await expect(
      wrongBot.service.consumeBrowserLogin('a'.repeat(32), 'bot-1'),
    ).resolves.toEqual({ status: 'expired' });
    expect(
      wrongBot.tx.financeBrowserLoginChallenge.updateMany,
    ).not.toHaveBeenCalled();
  });
});

import {
  GreeterFailureBehavior,
  GreeterJoinRequestStatus,
} from '@prisma/client';
import { GreeterExpiryService } from './greeter-expiry.service';

const bot = {
  runtimeInstances: [
    {
      botTokenEncrypted: 'enc',
      botTokenIv: 'iv',
      botTokenAuthTag: 'tag',
    },
  ],
};

function join(id: string, behavior: GreeterFailureBehavior) {
  return {
    id,
    status: GreeterJoinRequestStatus.PENDING_CAPTCHA,
    telegramUserId: id,
    botIntegration: bot,
    channel: { telegramChatId: '-1001' },
    greeterChannel: { failureBehavior: behavior, config: null },
  };
}

describe('GreeterExpiryService', () => {
  function expiryHarness(
    behavior: GreeterFailureBehavior,
    privateChatId: string | null,
    failureMessage: string | null,
  ) {
    const due = {
      ...join('user', behavior),
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      telegramBotUserId: 'bot-user',
      captchaChatId: 'temporary-join-chat',
      telegramUser: { telegramChatId: privateChatId, firstName: 'Ada' },
      channel: { telegramChatId: '-1001', title: 'News', username: null },
    };
    const prisma = {
      greeterJoinRequest: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: due.id }])
          .mockResolvedValueOnce([due]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    } as any;
    const api = {
      declineChatJoinRequest: jest.fn().mockResolvedValue(true),
    } as any;
    const delivery = {
      enqueueSendMessage: jest.fn().mockResolvedValue({ id: 'outcome' }),
    } as any;
    const service = new GreeterExpiryService(
      prisma,
      api,
      { decrypt: jest.fn().mockReturnValue('token') } as any,
      {
        effectiveConfig: jest.fn().mockResolvedValue({
          failureMessage,
          failureBehavior: behavior,
        }),
      } as any,
      delivery,
    );
    return { service, prisma, api, delivery };
  }

  it('expires KEEP_PENDING without declining and never uses the temporary join chat for failure copy', async () => {
    const { service, prisma, api, delivery } = expiryHarness(
      GreeterFailureBehavior.KEEP_PENDING,
      null,
      'Sorry {{user.firstName}}',
    );
    await expect(service.processDueBatch()).resolves.toMatchObject({
      processed: 1,
      failed: 0,
    });
    expect(api.declineChatJoinRequest).not.toHaveBeenCalled();
    expect(delivery.enqueueSendMessage).not.toHaveBeenCalled();
    expect(prisma.greeterJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GreeterJoinRequestStatus.EXPIRED,
        }),
      }),
    );
  });

  it('declines DECLINE expiries and queues failure copy only to the known private bot chat', async () => {
    const { service, prisma, api, delivery } = expiryHarness(
      GreeterFailureBehavior.DECLINE,
      'private-chat',
      'Sorry **{{user.firstName}}**',
    );
    await expect(service.processDueBatch()).resolves.toMatchObject({
      processed: 1,
      failed: 0,
    });
    expect(api.declineChatJoinRequest).toHaveBeenCalledWith('token', {
      chat_id: '-1001',
      user_id: 'user',
    });
    expect(delivery.enqueueSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'private-chat',
        text: 'Sorry <b>Ada</b>',
        parseMode: 'HTML',
        idempotencyKey: 'greeter-failure:user',
      }),
    );
    expect(prisma.greeterJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GreeterJoinRequestStatus.DECLINED,
          declinedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('claims due rows and isolates one Telegram failure from the batch', async () => {
    const prisma = {
      greeterJoinRequest: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }])
          .mockResolvedValueOnce([
            join('one', GreeterFailureBehavior.DECLINE),
            join('two', GreeterFailureBehavior.KEEP_PENDING),
          ]),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
      },
    } as any;
    const api = {
      declineChatJoinRequest: jest
        .fn()
        .mockRejectedValue(new Error('provider failed')),
    } as any;
    const service = new GreeterExpiryService(
      prisma,
      api,
      {
        decrypt: jest.fn().mockReturnValue('token'),
      } as any,
      {
        effectiveConfig: jest
          .fn()
          .mockResolvedValueOnce({
            failureMessage: null,
            failureBehavior: GreeterFailureBehavior.DECLINE,
          })
          .mockResolvedValueOnce({
            failureMessage: null,
            failureBehavior: GreeterFailureBehavior.KEEP_PENDING,
          }),
      } as any,
      {} as any,
    );

    await expect(service.processDueBatch(10)).resolves.toEqual({
      claimed: 2,
      processed: 1,
      failed: 1,
    });
    expect(prisma.greeterJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GreeterJoinRequestStatus.EXPIRED,
        }),
      }),
    );
    expect(prisma.greeterJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiryClaimOwner: null,
          expiryClaimUntil: expect.any(Date),
          lastDecisionError: 'provider failed',
        }),
      }),
    );
  });

  it('completes a bounded retry after a transient Telegram error', async () => {
    const { service, prisma, api } = expiryHarness(
      GreeterFailureBehavior.DECLINE,
      null,
      null,
    );
    const due = {
      ...join('user', GreeterFailureBehavior.DECLINE),
      workspaceId: 'workspace',
      botIntegrationId: 'bot',
      telegramBotUserId: 'bot-user',
      telegramUser: { telegramChatId: null, firstName: 'Ada' },
      channel: { telegramChatId: '-1001', title: 'News', username: null },
      greeterChannel: { config: null },
      environment: 'PRODUCTION',
    };
    prisma.greeterJoinRequest.findMany
      .mockReset()
      .mockResolvedValueOnce([{ id: due.id }])
      .mockResolvedValueOnce([due])
      .mockResolvedValueOnce([{ id: due.id }])
      .mockResolvedValueOnce([due]);
    api.declineChatJoinRequest
      .mockRejectedValueOnce(new Error('temporary Telegram failure'))
      .mockResolvedValueOnce(true);

    await expect(service.processDueBatch()).resolves.toMatchObject({
      failed: 1,
    });
    await expect(service.processDueBatch()).resolves.toMatchObject({
      processed: 1,
      failed: 0,
    });

    expect(prisma.greeterJoinRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: GreeterJoinRequestStatus.DECLINED,
          expiryClaimUntil: null,
        }),
      }),
    );
  });

  it('does not process a row when another worker won its claim', async () => {
    const prisma = {
      greeterJoinRequest: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'one' }])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as any;
    const api = { declineChatJoinRequest: jest.fn() } as any;
    const service = new GreeterExpiryService(
      prisma,
      api,
      {
        decrypt: jest.fn(),
      } as any,
      {} as any,
      {} as any,
    );

    await expect(service.processDueBatch()).resolves.toEqual({
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    expect(api.declineChatJoinRequest).not.toHaveBeenCalled();
  });
});

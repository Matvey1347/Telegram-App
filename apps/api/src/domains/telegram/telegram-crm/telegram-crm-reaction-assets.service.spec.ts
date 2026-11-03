import * as config from '../../../config/deployment-config';
import { TelegramCrmReactionAssetsService } from './telegram-crm-reaction-assets.service';

describe('TelegramCrmReactionAssetsService', () => {
  it('resolves only IDs in messages from the authorized conversation and checks access before and after runtime work', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        contentMetadata: {
          reactions: [
            { emoji: 'custom:123', count: 1 },
            { emoji: '👍', count: 1 },
            { emoji: 'custom:456', count: 2 },
          ],
        },
      },
    ]);
    const access = {
      conversation: jest.fn().mockResolvedValue({
        row: { workspaceId: 'w', mtprotoAccountId: 'a' },
      }),
    };
    const getReactionAssets = jest
      .fn()
      .mockResolvedValue({ '123': { type: 'unicode', value: '🤝' } });
    const runtime = {
      withAccountHandle: jest
        .fn()
        .mockImplementation(async (_w, _a, _p, fn) =>
          fn({ getReactionAssets }),
        ),
    };
    const service = new TelegramCrmReactionAssetsService(
      { telegramCrmMessage: { findMany } } as never,
      access as never,
      runtime as never,
    );
    const result = await service.get('user', 'conversation', ['message']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'w',
          conversationId: 'conversation',
          id: { in: ['message'] },
        }),
      }),
    );
    expect(access.conversation).toHaveBeenCalledTimes(3);
    expect(getReactionAssets).toHaveBeenCalledWith(['123', '456'], undefined);
    expect(result.items).toHaveProperty('123');
  });
  it('does not access runtime without a matching custom reaction', async () => {
    const runtime = { withAccountHandle: jest.fn() };
    const service = new TelegramCrmReactionAssetsService(
      {
        telegramCrmMessage: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {
        conversation: jest
          .fn()
          .mockResolvedValue({ row: { workspaceId: 'w' } }),
      } as never,
      runtime as never,
    );
    expect(await service.get('user', 'other', ['message'])).toEqual({
      items: {},
    });
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
  });
  it('propagates denied access without reading messages', async () => {
    const findMany = jest.fn();
    const service = new TelegramCrmReactionAssetsService(
      { telegramCrmMessage: { findMany } } as never,
      {
        conversation: jest.fn().mockRejectedValue(new Error('denied')),
      } as never,
      {} as never,
    );
    await expect(
      service.get('user', 'conversation', ['message']),
    ).rejects.toThrow('denied');
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('requested reaction document IDs', () => {
  it('intersects requested IDs with reactions of authorized messages', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        contentMetadata: {
          reactions: [{ emoji: 'custom:123' }, { emoji: 'custom:456' }],
        },
      },
    ]);
    const access = {
      conversation: jest.fn().mockResolvedValue({
        row: { workspaceId: 'w', mtprotoAccountId: 'a' },
      }),
    };
    const getReactionAssets = jest.fn().mockResolvedValue({});
    const runtime = {
      withAccountHandle: jest
        .fn()
        .mockImplementation(async (_w, _a, _p, fn) =>
          fn({ getReactionAssets }),
        ),
    };
    const service = new TelegramCrmReactionAssetsService(
      { telegramCrmMessage: { findMany } } as never,
      access as never,
      runtime as never,
    );
    await service.get('user', 'conversation', ['message'], undefined, [
      '456',
      '999',
    ]);
    expect(getReactionAssets).toHaveBeenCalledWith(['456'], undefined);
  });
});

describe('local proxy reaction lookup', () => {
  it('uses only authorized reaction IDs with the local bot and rechecks access', async () => {
    const enabled = jest
      .spyOn(config, 'crmLocalReactionAssetsEnabled')
      .mockReturnValue(true);
    const access = {
      conversation: jest.fn().mockResolvedValue({
        row: { workspaceId: 'w', mtprotoAccountId: 'a' },
      }),
    };
    const get = jest
      .fn()
      .mockResolvedValue({ '123': { type: 'unicode', value: '🤝' } });
    const runtime = { withAccountHandle: jest.fn() };
    const service = new TelegramCrmReactionAssetsService(
      {
        telegramCrmMessage: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { contentMetadata: { reactions: [{ emoji: 'custom:123' }] } },
            ]),
        },
      } as never,
      access as never,
      runtime as never,
      { get } as never,
      { localToken: 'local-token' } as never,
    );
    try {
      expect(
        await service.get('user', 'chat', ['message'], undefined, [
          '123',
          '999',
        ]),
      ).toEqual({ items: { '123': { type: 'unicode', value: '🤝' } } });
      expect(get).toHaveBeenCalledWith('local-token', ['123'], undefined);
      expect(access.conversation).toHaveBeenCalledTimes(2);
      expect(runtime.withAccountHandle).not.toHaveBeenCalled();
    } finally {
      enabled.mockRestore();
    }
  });
});

const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { reconcileCrmReactionHints } from './telegram-crm-reaction-reconcile';
const account = { id: 'account', workspaceId: 'workspace' };
describe('reaction hints', () => {
  it('idle batch performs no query or Telegram call', async () => {
    const findMany = jest.fn();
    await expect(
      reconcileCrmReactionHints(
        { telegramCrmConversation: { findMany } } as never,
        account,
        {} as never,
        [],
      ),
    ).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('coalesces stale hints and reads current server counts once for exact account peer', async () => {
    const getMessage = jest.fn().mockResolvedValue({
      telegramUserId: '123',
      telegramMessageId: 7,
      contentMetadata: { reactions: [] },
    });
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { telegramAccessHash: '456', peer: { telegramUserId: '123' } },
      ]);
    const hint = {
      type: 'message.reactions' as const,
      telegramUserId: '123',
      telegramMessageId: 7,
      reactions: [{ emoji: '👍', count: 99, chosen: false }],
    };
    const result = await reconcileCrmReactionHints(
      { telegramCrmConversation: { findMany } } as never,
      account,
      { chatActions: { getMessage } } as never,
      [hint, hint],
    );
    expect(getMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        type: 'message.edited',
        message: containing({
          contentMetadata: { reactions: [] },
        }),
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      containing({
        where: containing({
          workspaceId: 'workspace',
          mtprotoAccountId: 'account',
        }),
      }),
    );
  });
  it('same-second reversed edit events re-read current remote content once', async () => {
    const fresh = {
      telegramUserId: '123',
      telegramMessageId: 7,
      text: 'Latest',
      editedAt: new Date('2026-11-01T01:00:00Z'),
      contentMetadata: null,
    };
    const getMessage = jest.fn().mockResolvedValue(fresh);
    const prisma = {
      telegramCrmConversation: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { telegramAccessHash: '456', peer: { telegramUserId: '123' } },
          ]),
      },
    };
    const result = await reconcileCrmReactionHints(
      prisma as never,
      account,
      { chatActions: { getMessage } } as never,
      [
        {
          type: 'message.edited',
          message: { ...fresh, text: 'Latest' },
        } as never,
        {
          type: 'message.edited',
          message: { ...fresh, text: 'Older same second' },
        } as never,
      ],
    );
    expect(getMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ type: 'message.edited', message: fresh }]);
  });
});

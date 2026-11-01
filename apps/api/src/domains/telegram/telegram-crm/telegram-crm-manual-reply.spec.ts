import { resolveManualReply } from './telegram-crm-manual-reply';
jest.mock('../../../config/deployment-config', () => ({
  crmChatRollout: () => ({ actions: true, media: true }),
}));
const conversation = {
  id: 'conversation',
  workspaceId: 'workspace',
  mtprotoAccountId: 'account',
};
const peer = { telegramUserId: '123', telegramAccessHash: '456' };
describe('real manual reply target', () => {
  it('passes the available original numeric ID under exact conversation/account/workspace', async () => {
    const prisma = {
      telegramCrmMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ telegramMessageIdNumeric: 17 }),
      },
    };
    const handle = {
      chatActions: {
        getMessage: jest.fn().mockResolvedValue({ telegramUserId: '123' }),
      },
    };
    await expect(
      resolveManualReply(
        prisma as never,
        handle as never,
        conversation,
        peer,
        'original',
      ),
    ).resolves.toBe(17);
    expect(prisma.telegramCrmMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'original',
          conversationId: 'conversation',
          workspaceId: 'workspace',
          mtprotoAccountId: 'account',
          deletedAt: null,
        },
      }),
    );
    expect(handle.chatActions.getMessage).toHaveBeenCalledWith({
      ...peer,
      telegramMessageId: 17,
    });
  });
  it('rejects a deleted, other-account or unavailable local original without Telegram work', async () => {
    const prisma = {
      telegramCrmMessage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const getMessage = jest.fn();
    await expect(
      resolveManualReply(
        prisma as never,
        { chatActions: { getMessage } } as never,
        conversation,
        peer,
        'foreign',
      ),
    ).rejects.toThrow('CHAT_REPLY_ORIGINAL_UNAVAILABLE');
    expect(getMessage).not.toHaveBeenCalled();
  });
  it('rejects a remotely removed original and does not send a text quote', async () => {
    const prisma = {
      telegramCrmMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ telegramMessageIdNumeric: 17 }),
      },
    };
    await expect(
      resolveManualReply(
        prisma as never,
        {
          chatActions: { getMessage: jest.fn().mockResolvedValue(null) },
        } as never,
        conversation,
        peer,
        'removed',
      ),
    ).rejects.toThrow('CHAT_REPLY_ORIGINAL_UNAVAILABLE');
  });
  it('legacy text needs no action capability or target query', async () => {
    const prisma = { telegramCrmMessage: { findFirst: jest.fn() } };
    await expect(
      resolveManualReply(prisma as never, {} as never, conversation, peer),
    ).resolves.toBeUndefined();
    expect(prisma.telegramCrmMessage.findFirst).not.toHaveBeenCalled();
  });
});

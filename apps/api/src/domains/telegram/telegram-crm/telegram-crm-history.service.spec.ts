import { TelegramCrmHistoryService } from './telegram-crm-history.service';

const conversation = {
  id: 'conversation-1',
  contactId: null,
  mtprotoAccountId: 'account-fixed',
  telegramAccessHash: 'access-hash',
  historyCursorTelegramMessageId: 700,
  historyExhausted: false,
  peer: { telegramUserId: '42', username: 'alice' },
  contact: null,
};

describe('TelegramCrmHistoryService', () => {
  it('loads one bounded page through the fixed account and persists the next cursor', async () => {
    const handle = {
      getHistory: jest.fn().mockResolvedValue({
        messages: [
          {
            telegramMessageId: 699,
            telegramUserId: '42',
            direction: 'INBOUND',
            text: 'Older',
            sentAt: new Date('2026-08-30T10:00:00.000Z'),
            editedAt: null,
            contentMetadata: null,
          },
        ],
        nextBeforeTelegramMessageId: 699,
        exhausted: false,
      }),
    };
    const runtime = {
      withAccountHandle: jest.fn(
        async (
          _workspaceId: string,
          _accountId: string,
          _purpose: string,
          operation: (value: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
    const batchStore = {
      importHistory: jest.fn().mockResolvedValue({ imported: 1 }),
    };
    const service = new TelegramCrmHistoryService(
      {
        telegramCrmConversation: {
          findFirst: jest.fn().mockResolvedValue(conversation),
        },
      } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        requireOwnOrAny: jest.fn(),
      } as never,
      runtime as never,
      batchStore as never,
    );

    await expect(
      service.import('user-1', 'conversation-1', {}),
    ).resolves.toEqual({
      conversationId: 'conversation-1',
      imported: 1,
      scanned: 1,
      nextBeforeTelegramMessageId: 699,
      exhausted: false,
    });
    expect(runtime.withAccountHandle).toHaveBeenCalledWith(
      'workspace-1',
      'account-fixed',
      'sync',
      expect.any(Function),
    );
    expect(handle.getHistory).toHaveBeenCalledWith({
      telegramUserId: '42',
      telegramAccessHash: 'access-hash',
      beforeTelegramMessageId: 700,
      limit: 50,
    });
    expect(batchStore.importHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'account-fixed',
        nextBeforeTelegramMessageId: 699,
        exhausted: false,
      }),
    );
  });

  it('does no Telegram or database write after history is exhausted', async () => {
    const runtime = { withAccountHandle: jest.fn() };
    const batchStore = { importHistory: jest.fn() };
    const service = new TelegramCrmHistoryService(
      {
        telegramCrmConversation: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...conversation, historyExhausted: true }),
        },
      } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        requireOwnOrAny: jest.fn(),
      } as never,
      runtime as never,
      batchStore as never,
    );

    await expect(
      service.import('user-1', 'conversation-1', {}),
    ).resolves.toEqual({
      conversationId: 'conversation-1',
      imported: 0,
      scanned: 0,
      nextBeforeTelegramMessageId: null,
      exhausted: true,
    });
    expect(runtime.withAccountHandle).not.toHaveBeenCalled();
    expect(batchStore.importHistory).not.toHaveBeenCalled();
  });
});

const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { TelegramCrmManualSendIntentService } from './telegram-crm-manual-send-intent.service';
const input = {
  workspaceId: 'workspace',
  conversationId: 'conversation',
  mtprotoAccountId: 'account',
  userId: 'user',
  key: 'stable-key',
  text: 'Message',
  replyToMessageId: 'original',
};
describe('manual text durable intent', () => {
  it('claims before transport and binds actor, text and reply without storing plaintext', async () => {
    const create = jest
      .fn()
      .mockImplementation(({ data }: { data: unknown }) =>
        Promise.resolve(data),
      );
    const prisma = {
      telegramCrmChatOperation: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const service = new TelegramCrmManualSendIntentService(
      prisma as never,
      {} as never,
    );
    const key = await service.claim(input);
    expect(key).toMatch(/^text:/);
    expect(create).toHaveBeenCalledWith(
      containing({
        data: containing({
          status: 'UNKNOWN',
          kind: 'TEXT',
          actorUserId: 'user',
          request: containing({ replyToMessageId: 'original' }),
        }),
      }),
    );
    expect(JSON.stringify(create.mock.calls)).not.toContain('"text":"Message"');
  });
  it('uncertain prior claim blocks all blind retries and changed payloads', async () => {
    let saved: unknown = null;
    const create = jest
      .fn()
      .mockImplementation(({ data }: { data: unknown }) => {
        saved = data;
        return Promise.resolve(data);
      });
    const service = new TelegramCrmManualSendIntentService(
      {
        telegramCrmChatOperation: {
          findUnique: jest
            .fn()
            .mockImplementation(() => Promise.resolve(saved)),
          create,
        },
      } as never,
      {} as never,
    );
    await service.claim(input);
    await expect(service.claim(input)).rejects.toThrow(
      'CHAT_SEND_OUTCOME_UNKNOWN',
    );
    await expect(
      service.claim({ ...input, replyToMessageId: 'different' }),
    ).rejects.toThrow('CHAT_OPERATION_CONFLICT');
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('receipt check is read-only and null does not establish a failed send', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const access = {
      conversation: jest
        .fn()
        .mockResolvedValue({ row: { workspaceId: 'workspace' } }),
    };
    const service = new TelegramCrmManualSendIntentService(
      { telegramCrmMessage: { findFirst } } as never,
      access as never,
    );
    await expect(
      service.lookup('user', 'conversation', 'key'),
    ).resolves.toBeNull();
    expect(access.conversation).toHaveBeenCalledWith(
      'user',
      'conversation',
      true,
    );
  });
});

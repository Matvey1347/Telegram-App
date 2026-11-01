const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { Prisma } from '@prisma/client';
import { TelegramCrmChatReceipts } from './telegram-crm-chat-receipts.service';
jest.mock('../../../config/deployment-config', () => ({
  crmChatRollout: jest.fn(() => ({ actions: true, media: true })),
}));
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TelegramCrmChatMedia } from './telegram-crm-chat-media.service';
import { CRM_CHAT_MEDIA_LIMIT } from './telegram-crm-chat-operations.service';
const input = {
  operationId: `${new Date().toISOString().slice(0, 10)}:a6dca89f-3300-4674-85d2-1f54afc74587`,
  kind: 'FILE' as const,
};
const conversation = {
  id: 'conversation',
  workspaceId: 'workspace',
  mtprotoAccountId: 'account',
};
function setup() {
  const api = {
    sendMedia: jest.fn().mockResolvedValue({ telegramMessageId: 21 }),
    downloadMedia: jest.fn().mockResolvedValue({
      data: Buffer.from('file'),
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
    }),
    getMessage: jest.fn().mockResolvedValue({}),
  };
  const access = {
    conversation: jest.fn().mockResolvedValue({ row: conversation }),
    withHandle: jest.fn(
      (
        _u: string,
        _id: string,
        _m: boolean,
        _c: boolean,
        fn: (
          handle: { chatActions: typeof api },
          current: typeof conversation,
          peer: { telegramUserId: string; telegramAccessHash: string },
          memberId: string,
        ) => Promise<unknown>,
      ) =>
        fn(
          { chatActions: api },
          conversation,
          { telegramUserId: '42', telegramAccessHash: '123' },
          'member',
        ),
    ),
  };
  const operations = {
    source: jest
      .fn()
      .mockResolvedValue({ telegramMessageIdNumeric: 5, deletedAt: null }),
    failed: jest.fn().mockResolvedValue({ status: 'UNKNOWN' }),
  };
  const receipts = {
    claim: jest
      .fn()
      .mockResolvedValue({ receipt: { id: 'receipt' }, fresh: true }),
    response: jest.fn().mockResolvedValue({ status: 'UNKNOWN' }),
    finish: jest.fn().mockResolvedValue({}),
  };
  const store = { confirmed: jest.fn().mockResolvedValue({ id: 'stored' }) };
  const service = new TelegramCrmChatMedia(
    access as never,
    operations as never,
    receipts as never,
    store as never,
  );
  return { api, access, operations, receipts, store, service };
}
const file = () =>
  ({
    buffer: Buffer.from('%PDF-fixture'),
    originalname: 'report.pdf',
    mimetype: 'application/pdf',
  }) as Express.Multer.File;
describe('TelegramCrmChatMedia', () => {
  it('uses account-bound bytes and returns canonical projection; releases buffer', async () => {
    const x = setup();
    const fixture = file();
    const result = await x.service.upload('u', 'conversation', input, fixture);
    expect(result.status).toBe('CONFIRMED');
    expect(x.api.sendMedia).toHaveBeenCalledWith(
      containing({
        fileName: 'report.pdf',
        kind: 'FILE',
        randomId: expect.any(BigInt) as unknown,
      }),
    );
    expect(fixture.buffer.length).toBe(0);
    expect(JSON.stringify(x.receipts.claim.mock.calls)).not.toContain('%PDF');
  });
  it('rejects missing and oversize media without claim/provider', async () => {
    const x = setup();
    await expect(x.service.upload('u', 'conversation', input)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      x.service.upload('u', 'conversation', input, {
        ...file(),
        buffer: Buffer.alloc(CRM_CHAT_MEDIA_LIMIT + 1),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(x.receipts.claim).not.toHaveBeenCalled();
    expect(x.api.sendMedia).not.toHaveBeenCalled();
  });
  it('never repeats media after lost response replay', async () => {
    const x = setup();
    x.receipts.claim.mockResolvedValue({
      receipt: { id: 'receipt' },
      fresh: false,
    });
    await x.service.upload('u', 'conversation', input, file());
    expect(x.api.sendMedia).not.toHaveBeenCalled();
  });
  it('retains UNKNOWN after upload timeout', async () => {
    const x = setup();
    x.api.sendMedia.mockRejectedValue(new Error('lost connection'));
    expect(
      (await x.service.upload('u', 'conversation', input, file())).status,
    ).toBe('UNKNOWN');
    expect(x.operations.failed).toHaveBeenCalled();
    expect(x.store.confirmed).not.toHaveBeenCalled();
  });
  it('refuses a deleted original reply', async () => {
    const x = setup();
    x.operations.source.mockResolvedValue({
      telegramMessageIdNumeric: 5,
      deletedAt: new Date(),
    });
    await x.service.upload(
      'u',
      'conversation',
      { ...input, replyToMessageId: 'deleted' },
      file(),
    );
    expect(x.api.sendMedia).not.toHaveBeenCalled();
  });
  it('download is lazy/authorized and bounded by server limit, never a caller URL', async () => {
    const x = setup();
    const result = await x.service.download('u', 'conversation', 'message');
    expect(result.fileName).toBe('report.pdf');
    expect(x.api.downloadMedia).toHaveBeenCalledWith({
      telegramUserId: '42',
      telegramAccessHash: '123',
      telegramMessageId: 5,
      maxBytes: CRM_CHAT_MEDIA_LIMIT,
    });
  });
  it('does not fetch media when workspace authorization fails', async () => {
    const x = setup();
    x.access.withHandle.mockRejectedValue(new ForbiddenException());
    await expect(x.service.download('u', 'foreign', 'message')).rejects.toThrow(
      ForbiddenException,
    );
    expect(x.api.downloadMedia).not.toHaveBeenCalled();
  });
  it('blocks identical media under a new key after an UNKNOWN upload and reload', async () => {
    const x = setup();
    let pendingTarget: string | undefined;
    const table = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          if (pendingTarget === data.targetMessageId)
            throw new Prisma.PrismaClientKnownRequestError('pending target', {
              code: 'P2002',
              clientVersion: 'test',
            });
          pendingTarget = data.targetMessageId as string;
          return { ...data, id: 'receipt', status: 'UNKNOWN', result: null };
        }),
    };
    const realReceipts = new TelegramCrmChatReceipts({
      telegramCrmChatOperation: table,
    } as never);
    x.receipts.claim.mockImplementation(
      realReceipts.claim.bind(realReceipts) as never,
    );
    x.api.sendMedia.mockRejectedValue(new Error('upload response lost'));
    expect(
      (await x.service.upload('user', 'conversation', input, file())).status,
    ).toBe('UNKNOWN');
    await expect(
      x.service.upload(
        'user',
        'conversation',
        {
          ...input,
          operationId: input.operationId.replace('a6dca89f', 'a6dca89e'),
        },
        file(),
      ),
    ).rejects.toThrow('CHAT_MESSAGE_OPERATION_PENDING');
    expect(x.api.sendMedia).toHaveBeenCalledTimes(1);
    expect(pendingTarget).toMatch(/^media:[a-f0-9]{64}$/);
  });
});

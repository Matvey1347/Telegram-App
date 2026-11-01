import { Prisma } from '@prisma/client';
const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { ConflictException } from '@nestjs/common';
import {
  TelegramCrmChatReceipts,
  chatOperationFingerprint,
  chatRandomId,
} from './telegram-crm-chat-receipts.service';
const key = () =>
  `${new Date().toISOString().slice(0, 10)}:a6dca89f-3300-4674-85d2-1f54afc74587`;
const input = () => ({
  workspaceId: 'workspace',
  operationId: key(),
  actorUserId: 'actor',
  conversationId: 'conversation',
  mtprotoAccountId: 'account',
  targetMessageId: 'message',
  kind: 'EDIT',
  request: { text: 'bounded' },
  fingerprint: 'sha256',
});
function setup() {
  const table = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
      id: 'receipt',
      ...data,
    })),
    update: jest.fn().mockResolvedValue({}),
  };
  const prisma = {
    telegramCrmChatOperation: table,
    telegramCrmMessage: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  return { table, service: new TelegramCrmChatReceipts(prisma as never) };
}
describe('TelegramCrmChatReceipts', () => {
  it('claims UNKNOWN before any remote operation', async () => {
    const x = setup();
    const result = await x.service.claim(input());
    expect(result.fresh).toBe(true);
    expect(x.table.create).toHaveBeenCalledWith({
      data: containing({
        operationId: key(),
        requestFingerprint: 'sha256',
      }),
    });
  });
  it('returns exact durable receipt without another create', async () => {
    const x = setup();
    const value = input();
    x.table.findUnique.mockResolvedValue({
      ...value,
      requestFingerprint: value.fingerprint,
    });
    expect((await x.service.claim(value)).fresh).toBe(false);
    expect(x.table.create).not.toHaveBeenCalled();
  });
  it.each(['actorUserId', 'conversationId', 'requestFingerprint'])(
    'conflicts on changed %s',
    async (field) => {
      const x = setup();
      const value = input();
      x.table.findUnique.mockResolvedValue({
        ...value,
        requestFingerprint: value.fingerprint,
        [field]: 'other',
      });
      await expect(x.service.claim(value)).rejects.toThrow(ConflictException);
      expect(x.table.create).not.toHaveBeenCalled();
    },
  );
  it('rejects expired new receipt and permits existing replay after day boundary', async () => {
    const x = setup();
    const value = {
      ...input(),
      operationId: '2020-01-01:a6dca89f-3300-4674-85d2-1f54afc74587',
    };
    await expect(x.service.claim(value)).rejects.toThrow(ConflictException);
    x.table.findUnique.mockResolvedValue({
      ...value,
      requestFingerprint: value.fingerprint,
    });
    expect((await x.service.claim(value)).fresh).toBe(false);
  });
  it('stores only compact result identity, never message text/media bytes', async () => {
    const x = setup();
    await x.service.finish({ id: 'receipt' } as never, {
      operationId: key(),
      status: 'CONFIRMED',
      conversationId: 'conversation',
      message: { id: 'message', text: 'private' } as never,
    });
    expect(x.table.update).toHaveBeenCalledWith({
      where: { id: 'receipt' },
      data: {
        status: 'CONFIRMED',
        result: {
          operationId: key(),
          status: 'CONFIRMED',
          conversationId: 'conversation',
          messageId: 'message',
        },
      },
    });
  });
  it('binds provider random IDs and fingerprints to target/context', () => {
    expect(chatRandomId('a', 'c', 'key')).toBe(chatRandomId('a', 'c', 'key'));
    expect(chatRandomId('a', 'c', 'key')).not.toBe(
      chatRandomId('b', 'c', 'key'),
    );
    expect(chatOperationFingerprint({ text: 'one' })).not.toBe(
      chatOperationFingerprint({ text: 'two' }),
    );
  });
  it('retains UNKNOWN target locks during bounded thirty-day cleanup', async () => {
    const execute = jest
      .fn<Promise<number>, [Prisma.Sql]>()
      .mockResolvedValue(0);
    const receipts = new TelegramCrmChatReceipts({
      $executeRaw: execute,
    } as never);
    const now = new Date('2026-11-01T12:00:00Z');
    expect(await receipts.cleanup(now)).toBe(0);
    const query = execute.mock.calls[0][0];
    expect(query.strings.join('')).toContain(
      "kind <> 'TEXT' AND status <> 'UNKNOWN'",
    );
    expect(query.strings.join('')).toContain(
      'LIMIT 20000 FOR UPDATE SKIP LOCKED',
    );
    expect(query.values).toEqual([new Date('2026-10-02T12:00:00Z')]);
  });
});

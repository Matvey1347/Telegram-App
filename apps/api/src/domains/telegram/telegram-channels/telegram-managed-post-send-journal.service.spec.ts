import * as deliveryContext from './telegram-managed-post-delivery-context';
import {
  TelegramManagedPostSendJournalService,
  managedPostSendPayloadHash,
} from './telegram-managed-post-send-journal.service';

function setup() {
  let row: any;
  const prisma = {
    telegramManagedPost: {
      findFirst: jest.fn().mockResolvedValue({ id: 'post' }),
    },
    telegramManagedPostSendOperation: {
      createMany: jest.fn(async ({ data }) => {
        row ??= {
          id: 'operation',
          status: 'READY',
          messageIds: [],
          ...data[0],
        };
      }),
      findUniqueOrThrow: jest.fn(async () => ({ ...row })),
      updateMany: jest.fn(async ({ where, data }) => {
        const eligible =
          typeof where.status === 'string'
            ? row.status === where.status
            : where.status.in.includes(row.status);
        if (!eligible || (row.retryAt && row.retryAt > new Date() && where.OR))
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      findMany: jest.fn(async () => (row ? [row] : [])),
    },
  };
  const input = {
    postId: 'post',
    workspaceId: 'workspace',
    channelId: 'channel',
    sourceType: 'BOT' as const,
    sourceId: 'bot',
    ordinal: 0,
    payloadHash: managedPostSendPayloadHash({ text: 'hello' }),
  };
  const service = new TelegramManagedPostSendJournalService(prisma as never);
  return { prisma, service, input, current: () => row };
}

describe('Managed post durable send journal', () => {
  it('acknowledges accepted sends and skips a duplicate request after retry', async () => {
    const { service, input, current } = setup();
    const call = jest.fn().mockResolvedValue({ id: '123' });
    await expect(
      service.runOperation(input, call, (value: { id: string }) => [value.id]),
    ).resolves.toEqual(['123']);
    expect(current().status).toBe('ACKED');
    await expect(
      service.runOperation(input, call, (value: { id: string }) => [value.id]),
    ).resolves.toEqual(['123']);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('keeps an accepted response uncertain if its acknowledgement write fails', async () => {
    const { service, input, prisma, current } = setup();
    const update =
      prisma.telegramManagedPostSendOperation.updateMany.getMockImplementation()!;
    prisma.telegramManagedPostSendOperation.updateMany.mockImplementation(
      async (args) => {
        if (args.data.status === 'ACKED')
          throw new Error('database unavailable after Telegram response');
        return update(args);
      },
    );
    const call = jest.fn().mockResolvedValue(['123']);
    await expect(
      service.runOperation(input, call, (ids: string[]) => ids),
    ).rejects.toThrow('database unavailable');
    expect(current().status).toBe('UNKNOWN');
    await expect(
      service.runOperation(input, call, (ids: string[]) => ids),
    ).rejects.toThrow('outcome is unknown');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('keeps a fenced preflight safely retryable when no network call was made', async () => {
    const { service, input, current } = setup();
    const fence = jest
      .spyOn(deliveryContext, 'assertManagedPostDeliveryActive')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('dispatch aborted before send'));
    const call = jest.fn().mockResolvedValue(['123']);
    try {
      await expect(
        service.runOperation(input, call, (ids: string[]) => ids),
      ).rejects.toThrow('dispatch aborted');
      expect(call).not.toHaveBeenCalled();
      expect(current().status).toBe('REJECTED');
      expect(current().retryAt.getTime()).toBeGreaterThan(Date.now());
    } finally {
      fence.mockRestore();
    }
  });

  it('never resends a request whose response was lost', async () => {
    const { service, input, current } = setup();
    const call = jest.fn().mockRejectedValue(new Error('network timeout'));
    await expect(
      service.runOperation(input, call, () => ['123']),
    ).rejects.toThrow('network timeout');
    expect(current().status).toBe('UNKNOWN');
    await expect(
      service.runOperation(input, call, () => ['123']),
    ).rejects.toThrow('outcome is unknown');
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('does not send concurrently when another operation has started', async () => {
    const { service, input } = setup();
    const first = await service.begin(input);
    expect(first.acknowledged).toBe(false);
    await expect(service.begin(input)).rejects.toThrow('outcome is unknown');
  });

  it('retries an explicit rate-limit rejection only after its retry date', async () => {
    const { service, input, current } = setup();
    const error = {
      explicitRejected: true,
      errorCode: 429,
      retryAfterSeconds: 5,
    };
    await expect(
      service.runOperation(
        input,
        async () => {
          throw error;
        },
        () => [],
      ),
    ).rejects.toEqual(error);
    expect(current().status).toBe('REJECTED');
    await expect(service.begin(input)).rejects.toThrow('retry is not due');
    current().retryAt = new Date(Date.now() - 1);
    await expect(
      service.runOperation(
        input,
        async () => ['321'],
        (ids) => ids,
      ),
    ).resolves.toEqual(['321']);
  });

  it('blocks explicit forbidden errors and treats server errors as unknown', async () => {
    for (const errorCode of [403, 500]) {
      const { service, input, current } = setup();
      await expect(
        service.runOperation(
          input,
          async () => {
            throw { confirmedRejection: true, errorCode };
          },
          () => [],
        ),
      ).rejects.toMatchObject({ errorCode });
      expect(current().status).toBe(errorCode === 403 ? 'BLOCKED' : 'UNKNOWN');
    }
  });

  it('refuses payload changes or cross-workspace use after an operation exists', async () => {
    const { service, input } = setup();
    await service.begin(input);
    await expect(
      service.begin({
        ...input,
        payloadHash: managedPostSendPayloadHash({ text: 'changed' }),
      }),
    ).rejects.toThrow('outcome is unknown');
    await expect(
      service.begin({ ...input, workspaceId: 'other' }),
    ).rejects.toThrow('outcome is unknown');
  });

  it('hashes equivalent payload objects consistently without storing text or secrets', () => {
    expect(managedPostSendPayloadHash({ b: 2, a: 1 })).toEqual(
      managedPostSendPayloadHash({ a: 1, b: 2 }),
    );
    const hash = managedPostSendPayloadHash({ text: 'private content' });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('private');
  });
});

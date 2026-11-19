/* eslint-disable @typescript-eslint/require-await -- Stateful async port mocks deliberately complete synchronously. */
import { NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { AvatarEmojiApiError } from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { ChannelAvatarEmojiService } from './channel-avatar-emoji.service';
import { ChannelAvatarEmojiProcessorService } from './channel-avatar-emoji-processor.service';
import { channelAvatarEmojiImage } from './channel-avatar-emoji-image';

type Row = {
  id: string;
  workspaceId: string;
  presentationIconId: string | null;
  avatarEmojiIconId: string | null;
  avatarEmojiHash: string | null;
  avatarEmojiStatus: string | null;
  avatarEmojiError: string | null;
  avatarEmojiManual: boolean;
  avatarEmojiAttempts: number;
  avatarEmojiRetryAt: Date | null;
  sourceAccesses: {
    workspaceId: string;
    sourceId: string;
    sourceType: string;
    role: string;
  }[];
};
type Filter = Record<string, unknown>;

/** A small stateful store verifies conditional claims and concurrent mode changes. */
function matches(row: object, where: Filter): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR')
      return (condition as Filter[]).some((part) => matches(row, part));
    if (key === 'AND')
      return (condition as Filter[]).every((part) => matches(row, part));
    const value = (row as Record<string, unknown>)[key];
    if (
      condition &&
      typeof condition === 'object' &&
      !(condition instanceof Date)
    ) {
      const operators = condition as Filter;
      if ('some' in operators)
        return (
          Array.isArray(value) &&
          value.some((item: object) => matches(item, operators.some as Filter))
        );
      if ('in' in operators) return (operators.in as unknown[]).includes(value);
      if ('not' in operators) return value !== operators.not;
      if ('lte' in operators)
        return value instanceof Date && value <= (operators.lte as Date);
    }
    return value === condition;
  });
}

function fixture(photo: Buffer) {
  const row: Row = {
    id: 'channel-science',
    workspaceId: 'workspace-a',
    presentationIconId: null,
    avatarEmojiIconId: null,
    avatarEmojiHash: null,
    avatarEmojiStatus: null,
    avatarEmojiError: null,
    avatarEmojiManual: false,
    avatarEmojiAttempts: 0,
    avatarEmojiRetryAt: null,
    sourceAccesses: [
      {
        workspaceId: 'workspace-a',
        sourceId: 'account-a',
        sourceType: 'MTPROTO',
        role: 'OWNER',
      },
    ],
  };
  const updateMany = jest.fn(
    async ({ where, data }: { where: Filter; data: Filter }) => {
      if (!matches(row, where)) return { count: 0 };
      for (const [key, value] of Object.entries(data)) {
        if (
          key === 'avatarEmojiAttempts' &&
          value &&
          typeof value === 'object'
        ) {
          row.avatarEmojiAttempts += (value as { increment: number }).increment;
        } else Object.assign(row, { [key]: value });
      }
      return { count: 1 };
    },
  );
  const findFirst = jest.fn(async ({ where }: { where: Filter }) =>
    matches(row, where) ? { ...row } : null,
  );
  const channel = {
    updateMany,
    findFirst,
    findFirstOrThrow: jest.fn(async ({ where }: { where: Filter }) => {
      if (!matches(row, where)) throw new Error('Not found');
      return { ...row };
    }),
  };
  const icons = new Map<string, { id: string }>();
  const icon = {
    findFirst: jest.fn(
      async ({ where }: { where: { id: string; name: string } }) =>
        icons.get(where.name)?.id === where.id ? icons.get(where.name) : null,
    ),
    upsert: jest.fn(async ({ create }: { create: { name: string } }) => {
      const saved = icons.get(create.name) || { id: `icon-${icons.size + 1}` };
      icons.set(create.name, saved);
      return saved;
    }),
  };
  const account = {
    id: 'account-a',
    workspaceId: 'workspace-a',
    apiId: '123',
    apiHashEncrypted: 'test-encrypted-api-hash',
    apiHashIv: 'test-iv',
    apiHashAuthTag: 'test-tag',
    sessionEncrypted: 'test-encrypted-session',
    sessionIv: 'test-session-iv',
    sessionAuthTag: 'test-session-tag',
  };
  const prisma = {
    telegramChannel: channel,
    $executeRaw: jest.fn(async (query: { values: unknown[]; sql: string }) => {
      const [id, workspaceId] = query.values;
      if (
        id !== row.id ||
        workspaceId !== row.workspaceId ||
        !row.sourceAccesses.some(
          (source) =>
            source.workspaceId === workspaceId &&
            source.role === 'OWNER' &&
            source.sourceType === 'MTPROTO',
        )
      )
        return 0;
      if (
        !row.avatarEmojiManual &&
        row.presentationIconId === row.avatarEmojiIconId
      )
        return 0;
      row.avatarEmojiManual = false;
      row.presentationIconId = row.avatarEmojiIconId;
      return 1;
    }),
    telegramUserAccountIntegration: {
      findFirst: jest.fn(async ({ where }: { where: Filter }) =>
        where.workspaceId === row.workspaceId ? account : null,
      ),
    },
    icon,
    $transaction: jest.fn(
      async (
        work: (tx: {
          telegramChannel: typeof channel;
          icon: typeof icon;
        }) => Promise<unknown>,
      ) => work({ telegramChannel: channel, icon }),
    ),
  };
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-a'),
  };
  const encryption = {
    decrypt: jest.fn().mockReturnValue('test-decrypted-value'),
  };
  const catalog = { findOne: jest.fn(async () => ({ ...row })) };
  const photos = {
    download: jest
      .fn<Promise<Buffer | null>, unknown[]>()
      .mockResolvedValue(photo),
  };
  const publisher = {
    publish: jest.fn().mockImplementation(({ hash }: { hash: string }) =>
      Promise.resolve({
        hash,
        customEmojiId: '123456789',
        createdDocument: true,
        packId: 1,
      }),
    ),
  };
  const api = {
    configured: jest.fn().mockReturnValue(true),
    assetKey: jest.fn((hash: string) => hash),
  };
  const processor = new ChannelAvatarEmojiProcessorService(
    prisma as never,
    encryption as never,
    photos as never,
    publisher as never,
    api as never,
  );
  const service = new ChannelAvatarEmojiService(
    prisma as never,
    workspace as never,
    catalog as never,
    processor,
  );
  return { row, service, prisma, workspace, photos, publisher, api, icon };
}

describe('ChannelAvatarEmojiService', () => {
  let photo: Buffer;
  beforeAll(async () => {
    photo = await sharp({
      create: { width: 160, height: 120, channels: 3, background: '#ff4422' },
    })
      .png()
      .toBuffer();
  });

  it('enqueues a new channel and persists its generated emoji through the shared Icon relation', async () => {
    const f = fixture(photo);
    await f.service.enqueue(f.row.workspaceId, f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'PENDING',
      avatarEmojiAttempts: 0,
    });
    expect(f.publisher.publish).not.toHaveBeenCalled();
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'READY',
      avatarEmojiIconId: 'icon-1',
      presentationIconId: 'icon-1',
      avatarEmojiAttempts: 1,
      avatarEmojiRetryAt: null,
    });
    expect(f.row.avatarEmojiHash).toMatch(/^[a-f0-9]{64}$/);
    expect(f.icon.upsert.mock.calls[0][0]).toMatchObject({
      create: {
        workspaceId: f.row.workspaceId,
        emoji: '![📢](tg://emoji?id=123456789)',
      },
    });
  });

  it('does not republish an unchanged avatar or reprocess a finished claim', async () => {
    const f = fixture(photo);
    const image = await channelAvatarEmojiImage(photo);
    Object.assign(f.row, {
      avatarEmojiHash: image.hash,
      avatarEmojiIconId: 'saved-avatar',
      presentationIconId: 'saved-avatar',
    });
    f.icon.findFirst.mockResolvedValue({ id: 'saved-avatar' });
    const result = await f.service.refresh('user-a', f.row.id);
    expect(result).toMatchObject({
      avatarEmojiStatus: 'READY',
      presentationIconId: 'saved-avatar',
    });
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.photos.download).toHaveBeenCalledTimes(1);
    expect(f.publisher.publish).not.toHaveBeenCalled();
    expect(f.icon.upsert).not.toHaveBeenCalled();
  });

  it('creates and selects a new version only when the rendered avatar changes', async () => {
    const f = fixture(photo);
    await f.service.refresh('user-a', f.row.id);
    const previousHash = f.row.avatarEmojiHash;
    const nextPhoto = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#2255ff' },
    })
      .png()
      .toBuffer();
    f.photos.download.mockResolvedValue(nextPhoto);
    await f.service.refresh('user-a', f.row.id);
    expect(f.row.avatarEmojiHash).not.toBe(previousHash);
    expect(f.row.presentationIconId).toBe('icon-2');
    expect(f.publisher.publish).toHaveBeenCalledTimes(2);
    expect(f.icon.upsert).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    'uses ordinary fallback without publishing when no avatar exists (manual=%s)',
    async (manual) => {
      const f = fixture(photo);
      Object.assign(f.row, {
        avatarEmojiManual: manual,
        presentationIconId: manual ? 'manual-icon' : 'old-avatar',
        avatarEmojiIconId: 'old-avatar',
        avatarEmojiHash: 'old-hash',
      });
      f.photos.download.mockResolvedValue(null);
      await f.service.refresh('user-a', f.row.id);
      expect(f.row).toMatchObject({
        avatarEmojiStatus: 'NO_AVATAR',
        avatarEmojiIconId: null,
        avatarEmojiHash: null,
        avatarEmojiRetryAt: null,
        presentationIconId: manual ? 'manual-icon' : null,
      });
      expect(f.publisher.publish).not.toHaveBeenCalled();
    },
  );

  it('preserves a manual icon chosen while Telegram is still creating the avatar emoji', async () => {
    const f = fixture(photo);
    f.publisher.publish.mockImplementation(async () => {
      Object.assign(f.row, {
        avatarEmojiManual: true,
        presentationIconId: 'manual-selected-during-upload',
      });
      return {
        hash: (await channelAvatarEmojiImage(photo)).hash,
        customEmojiId: '987654321',
        createdDocument: true,
        packId: 1,
      };
    });
    await f.service.refresh('user-a', f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'READY',
      avatarEmojiIconId: 'icon-1',
      presentationIconId: 'manual-selected-during-upload',
      avatarEmojiManual: true,
    });
  });

  it('restores the avatar icon without contacting Telegram', async () => {
    const f = fixture(photo);
    Object.assign(f.row, {
      avatarEmojiIconId: 'saved-avatar',
      avatarEmojiManual: true,
      presentationIconId: 'manual',
    });
    await expect(f.service.restore('user-a', f.row.id)).resolves.toMatchObject({
      avatarEmojiManual: false,
      presentationIconId: 'saved-avatar',
    });
    expect(f.photos.download).not.toHaveBeenCalled();
    expect(f.publisher.publish).not.toHaveBeenCalled();
  });

  it('restores the latest avatar when its version changes after the ownership read', async () => {
    const f = fixture(photo);
    Object.assign(f.row, {
      avatarEmojiIconId: 'old-avatar',
      avatarEmojiManual: true,
      presentationIconId: 'manual',
    });
    const read = f.prisma.telegramChannel.findFirst.getMockImplementation()!;
    f.prisma.telegramChannel.findFirst.mockImplementationOnce(async (input) => {
      const snapshot = await read(input);
      f.row.avatarEmojiIconId = 'new-avatar-created-during-restore';
      return snapshot;
    });
    await expect(f.service.restore('user-a', f.row.id)).resolves.toMatchObject({
      presentationIconId: 'new-avatar-created-during-restore',
      avatarEmojiManual: false,
    });
    const query = f.prisma.$executeRaw.mock.calls[0][0];
    expect(query.sql).toContain('"presentationIconId" = "avatarEmojiIconId"');
    expect(query.values).toEqual([f.row.id, f.row.workspaceId]);
  });

  it('denies foreign-workspace refresh/restore and rejects an internal foreign-workspace claim', async () => {
    const f = fixture(photo);
    f.workspace.resolveWorkspaceIdForUser.mockResolvedValue('workspace-b');
    await expect(f.service.refresh('user-b', f.row.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(f.service.restore('user-b', f.row.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await f.service.process('workspace-b', f.row.id);
    expect(f.row.avatarEmojiStatus).toBeNull();
    expect(f.photos.download).not.toHaveBeenCalled();
    expect(f.publisher.publish).not.toHaveBeenCalled();
  });

  it('keeps one active channel claim across simultaneous refresh/process requests', async () => {
    const f = fixture(photo);
    let release!: (value: { customEmojiId: string }) => void;
    const published = new Promise<{ customEmojiId: string }>((resolve) => {
      release = resolve;
    });
    f.publisher.publish.mockReturnValue(published);
    await f.service.enqueue(f.row.workspaceId, f.row.id);
    const first = f.service.process(f.row.workspaceId, f.row.id);
    await Promise.resolve();
    await f.service.enqueue(f.row.workspaceId, f.row.id);
    await f.service.process(f.row.workspaceId, f.row.id);
    release({ customEmojiId: '123456789' });
    await first;
    expect(f.publisher.publish).toHaveBeenCalledTimes(1);
    expect(f.row.avatarEmojiAttempts).toBe(1);
    expect(f.row.avatarEmojiStatus).toBe('READY');
  });

  it('persists Telegram backoff, preserves the prior icon and stops after five failed attempts', async () => {
    const f = fixture(photo);
    f.row.presentationIconId = 'prior-icon';
    f.publisher.publish.mockRejectedValue(
      new AvatarEmojiApiError('Telegram rate limit', 120),
    );
    await f.service.enqueue(f.row.workspaceId, f.row.id);
    const startedAt = Date.now();
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'ERROR',
      avatarEmojiAttempts: 1,
      avatarEmojiError: 'Telegram rate limit',
      presentationIconId: 'prior-icon',
    });
    expect(f.row.avatarEmojiRetryAt!.getTime()).toBeGreaterThanOrEqual(
      startedAt + 120_000,
    );
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.publisher.publish).toHaveBeenCalledTimes(1);
    for (let attempt = 2; attempt <= 5; attempt++) {
      f.row.avatarEmojiRetryAt = new Date(0);
      await f.service.process(f.row.workspaceId, f.row.id);
    }
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'ERROR',
      avatarEmojiAttempts: 5,
      avatarEmojiRetryAt: null,
      presentationIconId: 'prior-icon',
    });
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.publisher.publish).toHaveBeenCalledTimes(5);
  });

  it('recovers safely from a transient failed attempt on a later due claim', async () => {
    const f = fixture(photo);
    f.photos.download.mockRejectedValueOnce(
      new Error('Network temporarily unavailable'),
    );
    await f.service.enqueue(f.row.workspaceId, f.row.id);
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.row.avatarEmojiStatus).toBe('ERROR');
    expect(f.row.avatarEmojiRetryAt).toBeInstanceOf(Date);
    f.row.avatarEmojiRetryAt = new Date(0);
    await f.service.process(f.row.workspaceId, f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'READY',
      avatarEmojiAttempts: 2,
      avatarEmojiRetryAt: null,
      presentationIconId: 'icon-1',
    });
    expect(f.publisher.publish).toHaveBeenCalledTimes(1);
  });

  it('does not retry a missing configuration or explicit permanent Telegram rejection automatically', async () => {
    const f = fixture(photo);
    f.api.configured.mockReturnValue(false);
    await f.service.refresh('user-a', f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'ERROR',
      avatarEmojiRetryAt: null,
    });
    expect(f.photos.download).not.toHaveBeenCalled();
    f.api.configured.mockReturnValue(true);
    f.publisher.publish.mockRejectedValue(
      new AvatarEmojiApiError('Invalid owner', undefined, true, 400),
    );
    await f.service.refresh('user-a', f.row.id);
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'ERROR',
      avatarEmojiRetryAt: null,
      avatarEmojiError: 'Invalid owner',
    });
  });
  it('leaves a caught one-shot failure terminal when automatic retries are disabled', async () => {
    const f = fixture(photo);
    f.photos.download.mockRejectedValue(new Error('Telegram unavailable'));
    await f.service.enqueue(f.row.workspaceId, f.row.id, false);
    await f.service.process(f.row.workspaceId, f.row.id, {
      scheduleRetry: false,
    });
    expect(f.row).toMatchObject({
      avatarEmojiStatus: 'ERROR',
      avatarEmojiRetryAt: null,
      avatarEmojiAttempts: 1,
    });
    expect(f.publisher.publish).not.toHaveBeenCalled();
  });
  it.each(['ADMIN', 'MEMBER', 'UNKNOWN', 'EXTERNAL'])(
    'never admits or processes %s-only channels',
    async (role) => {
      const f = fixture(photo);
      f.row.sourceAccesses =
        role === 'EXTERNAL'
          ? []
          : [
              {
                workspaceId: f.row.workspaceId,
                sourceId: 'account-a',
                sourceType: 'MTPROTO',
                role,
              },
            ];
      const before = structuredClone(f.row);
      await f.service.enqueue(f.row.workspaceId, f.row.id, false);
      await expect(
        f.service.process(f.row.workspaceId, f.row.id, {
          admit: true,
          scheduleRetry: false,
        }),
      ).resolves.toEqual({ status: 'NOT_OWNED' });
      expect(f.row).toEqual(before);
      expect(f.prisma.telegramChannel.updateMany).not.toHaveBeenCalled();
      expect(f.photos.download).not.toHaveBeenCalled();
      expect(f.publisher.publish).not.toHaveBeenCalled();
    },
  );

  it('rejects owner evidence from another workspace and never falls back to a mere admin account', async () => {
    const f = fixture(photo);
    f.row.sourceAccesses[0].workspaceId = 'different-workspace';
    await expect(
      f.service.process(f.row.workspaceId, f.row.id, { admit: true }),
    ).resolves.toEqual({ status: 'NOT_OWNED' });
    expect(
      f.prisma.telegramUserAccountIntegration.findFirst,
    ).not.toHaveBeenCalled();
    expect(f.prisma.telegramChannel.updateMany).not.toHaveBeenCalled();
  });

  it('atomically admits a one-shot owner avatar without queueing or opening MTProto for prepared bytes', async () => {
    const f = fixture(photo);
    const preparedImage = await channelAvatarEmojiImage(photo);
    await expect(
      f.service.process(f.row.workspaceId, f.row.id, {
        admit: true,
        scheduleRetry: false,
        preparedImage,
      }),
    ).resolves.toMatchObject({
      status: 'READY',
      createdDocument: true,
      customEmojiId: '123456789',
      packId: 1,
    });
    expect(
      f.prisma.telegramUserAccountIntegration.findFirst,
    ).not.toHaveBeenCalled();
    expect(f.photos.download).not.toHaveBeenCalled();
    expect(f.row.avatarEmojiStatus).toBe('READY');
  });

  it('refuses mismatched prepared content without Telegram calls', async () => {
    const f = fixture(photo);
    const preparedImage = {
      ...(await channelAvatarEmojiImage(photo)),
      hash: 'wrong-hash',
    };
    await expect(
      f.service.process(f.row.workspaceId, f.row.id, {
        admit: true,
        scheduleRetry: false,
        preparedImage,
      }),
    ).resolves.toEqual({ status: 'ERROR' });
    expect(f.publisher.publish).not.toHaveBeenCalled();
    expect(f.photos.download).not.toHaveBeenCalled();
    expect(f.row.avatarEmojiRetryAt).toBeNull();
  });
  it('rebinds an unchanged old-bot avatar through the current namespace while preserving a manual icon', async () => {
    const f = fixture(photo);
    const preparedImage = await channelAvatarEmojiImage(photo);
    Object.assign(f.row, {
      avatarEmojiHash: preparedImage.hash,
      avatarEmojiIconId: 'old-generated',
      presentationIconId: 'manual-user-icon',
      avatarEmojiManual: true,
    });
    f.api.assetKey.mockImplementation((hash) => `production:systembot:${hash}`);
    f.publisher.publish.mockResolvedValue({
      hash: f.api.assetKey(preparedImage.hash),
      customEmojiId: '987654321',
      createdDocument: true,
      packId: 2,
    });
    await expect(
      f.service.process(f.row.workspaceId, f.row.id, {
        admit: true,
        scheduleRetry: false,
        preparedImage,
      }),
    ).resolves.toMatchObject({
      status: 'READY',
      customEmojiId: '987654321',
      createdDocument: true,
    });
    expect(f.row).toMatchObject({
      avatarEmojiHash: preparedImage.hash,
      presentationIconId: 'manual-user-icon',
      avatarEmojiManual: true,
    });
    expect(f.row.avatarEmojiIconId).not.toBe('old-generated');
    expect(f.icon.upsert.mock.calls.at(-1)?.[0].create.name).toBe(
      `channel-avatar:production:systembot:${preparedImage.hash}`,
    );
  });
  it('requires the recorded owner account for a live photo and does not fall back to workspace administrators', async () => {
    const f = fixture(photo);
    f.prisma.telegramUserAccountIntegration.findFirst.mockResolvedValue(null);
    await expect(
      f.service.process(f.row.workspaceId, f.row.id, {
        admit: true,
        scheduleRetry: false,
      }),
    ).resolves.toEqual({ status: 'ERROR' });
    expect(
      f.prisma.telegramUserAccountIntegration.findFirst,
    ).toHaveBeenCalledTimes(1);
    const accountQuery =
      f.prisma.telegramUserAccountIntegration.findFirst.mock.calls[0][0];
    expect(accountQuery.where).toMatchObject({
      workspaceId: f.row.workspaceId,
      id: { in: ['account-a'] },
    });
    expect(f.photos.download).not.toHaveBeenCalled();
    expect(f.publisher.publish).not.toHaveBeenCalled();
  });
  it('does not restore an avatar after owner evidence is revoked during the request', async () => {
    const f = fixture(photo);
    Object.assign(f.row, {
      avatarEmojiIconId: 'generated',
      presentationIconId: 'manual',
      avatarEmojiManual: true,
    });
    const original =
      f.prisma.telegramChannel.findFirst.getMockImplementation()!;
    f.prisma.telegramChannel.findFirst.mockImplementationOnce(async (input) => {
      const result = await original(input);
      f.row.sourceAccesses[0].role = 'ADMIN';
      return result;
    });
    await f.service.restore('user-a', f.row.id);
    expect(f.row).toMatchObject({
      presentationIconId: 'manual',
      avatarEmojiManual: true,
    });
  });
  it('admits a newly established owner only once from account synchronization', async () => {
    const f = fixture(photo);
    f.row.avatarEmojiStatus = 'PENDING';
    await f.service.enqueueInitial(f.row.workspaceId, f.row.id);
    const firstDeadline = f.row.avatarEmojiRetryAt;
    expect(firstDeadline).toBeInstanceOf(Date);
    await f.service.enqueueInitial(f.row.workspaceId, f.row.id);
    expect(f.row.avatarEmojiRetryAt).toEqual(firstDeadline);
    expect(f.photos.download).not.toHaveBeenCalled();
    expect(f.publisher.publish).not.toHaveBeenCalled();
  });

  it('does not restart ready channels or admit administrator-only channels during repeated synchronization', async () => {
    const f = fixture(photo);
    Object.assign(f.row, {
      avatarEmojiStatus: 'READY',
      avatarEmojiIconId: 'existing-avatar',
      avatarEmojiRetryAt: null,
    });
    const before = structuredClone(f.row);
    await f.service.enqueueInitial(f.row.workspaceId, f.row.id);
    expect(f.row).toEqual(before);
    Object.assign(f.row, {
      avatarEmojiStatus: 'PENDING',
      avatarEmojiIconId: null,
    });
    f.row.sourceAccesses[0].role = 'ADMIN';
    await f.service.enqueueInitial(f.row.workspaceId, f.row.id);
    expect(f.row.avatarEmojiRetryAt).toBeNull();
    expect(f.publisher.publish).not.toHaveBeenCalled();
  });
});

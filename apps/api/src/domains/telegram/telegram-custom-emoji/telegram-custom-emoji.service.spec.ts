import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- focused Prisma mock call inspection */

function setup() {
  const tx = {
    telegramCustomEmojiPack: {
      upsert: jest.fn().mockResolvedValue({ id: 'pack-1' }),
    },
    telegramCustomEmoji: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    telegramCustomEmojiPack: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    telegramUserAccountIntegration: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      Promise.resolve(callback(tx)),
    ),
  };
  const workspaces = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const encryption = { decrypt: jest.fn().mockReturnValue('decrypted') };
  const mtproto = { getCustomEmojiPack: jest.fn() };
  const storage = { uploadMany: jest.fn() };
  const service = new TelegramCustomEmojiService(
    prisma as never,
    workspaces as never,
    encryption as never,
    mtproto as never,
    storage as never,
  );
  return { encryption, mtproto, prisma, service, storage, tx };
}

describe('TelegramCustomEmojiService workspace scope', () => {
  it('lists all packs belonging to the current workspace without channel links', async () => {
    const { prisma, service } = setup();
    prisma.telegramCustomEmojiPack.findMany.mockResolvedValue([
      {
        id: 'pack-1',
        shortName: 'workspace_pack',
        title: 'Workspace Pack',
        telegramLink: 'https://t.me/addemoji/workspace_pack',
        emojis: [],
      },
    ]);

    await expect(service.list('user-1')).resolves.toEqual({
      packs: [expect.objectContaining({ id: 'pack-1' })],
    });
    expect(prisma.telegramCustomEmojiPack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', archivedAt: null },
      }),
    );
  });

  it('returns an existing workspace pack without importing or attaching it per channel', async () => {
    const { prisma, service } = setup();
    prisma.telegramCustomEmojiPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      archivedAt: null,
    });

    await service.importPack('user-1', {
      source: 'https://t.me/addemoji/workspace_pack',
    });

    expect(
      prisma.telegramUserAccountIntegration.findFirst,
    ).not.toHaveBeenCalled();
    expect(prisma.telegramCustomEmojiPack.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', archivedAt: null },
      }),
    );
  });

  it('restores an archived workspace pack without downloading its assets again', async () => {
    const { mtproto, prisma, service, storage } = setup();
    prisma.telegramCustomEmojiPack.findUnique.mockResolvedValue({
      id: 'pack-1',
      archivedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await service.importPack('user-1', {
      source: 'https://t.me/addemoji/workspace_pack',
    });

    expect(prisma.telegramCustomEmojiPack.update).toHaveBeenCalledWith({
      where: { id: 'pack-1' },
      data: { archivedAt: null },
    });
    expect(mtproto.getCustomEmojiPack).not.toHaveBeenCalled();
    expect(storage.uploadMany).not.toHaveBeenCalled();
  });

  it('imports a new pack and persists its pack and emojis at workspace scope', async () => {
    const { mtproto, prisma, service, storage, tx } = setup();
    prisma.telegramCustomEmojiPack.findUnique.mockResolvedValue(null);
    prisma.telegramUserAccountIntegration.findFirst.mockResolvedValue({
      apiId: 123,
      apiHashEncrypted: 'hash',
      apiHashIv: 'hash-iv',
      apiHashAuthTag: 'hash-tag',
      sessionEncrypted: 'session',
      sessionIv: 'session-iv',
      sessionAuthTag: 'session-tag',
    });
    mtproto.getCustomEmojiPack.mockResolvedValue({
      shortName: 'workspace_pack',
      title: 'Workspace Pack',
      telegramSetId: 'set-1',
      documents: [
        {
          documentId: 'emoji-1',
          alt: '✨',
          mimeType: 'image/webp',
          kind: 'STATIC',
          isFree: false,
          needsRepainting: false,
          originalAsset: Buffer.from('asset'),
        },
      ],
    });
    storage.uploadMany.mockResolvedValue(
      new Map([
        [
          'telegram-custom-emoji/workspace-1/workspace_pack/emoji-1/original.webp',
          'https://assets.test/emoji.webp',
        ],
      ]),
    );

    await service.importPack('user-1', {
      source: 'https://t.me/addemoji/workspace_pack',
    });

    expect(tx.telegramCustomEmojiPack.upsert).toHaveBeenCalledTimes(1);
    const upsertInput = tx.telegramCustomEmojiPack.upsert.mock
      .calls[0]?.[0] as {
      create: { workspaceId: string };
    };
    expect(upsertInput.create.workspaceId).toBe('workspace-1');
    expect(tx.telegramCustomEmoji.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          packId: 'pack-1',
          documentId: 'emoji-1',
          assetUrl: 'https://assets.test/emoji.webp',
        }),
      ],
      skipDuplicates: true,
    });
    expect(prisma).not.toHaveProperty('telegramChannelCustomEmojiPack');
    expect(tx).not.toHaveProperty('telegramChannelCustomEmojiPack');
  });

  it('rejects a new import when the workspace has no active MTProto account', async () => {
    const { mtproto, prisma, service, storage } = setup();
    prisma.telegramCustomEmojiPack.findUnique.mockResolvedValue(null);
    prisma.telegramUserAccountIntegration.findFirst.mockResolvedValue(null);

    await expect(
      service.importPack('user-1', {
        source: 'https://t.me/addemoji/workspace_pack',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mtproto.getCustomEmojiPack).not.toHaveBeenCalled();
    expect(storage.uploadMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes only a pack owned by the current workspace', async () => {
    const { prisma, service } = setup();
    prisma.telegramCustomEmojiPack.updateMany.mockResolvedValue({ count: 1 });

    await service.deletePack('user-1', 'pack-1');

    expect(prisma.telegramCustomEmojiPack.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'pack-1',
        workspaceId: 'workspace-1',
        archivedAt: null,
      },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it('does not reveal or delete a pack from another workspace', async () => {
    const { prisma, service } = setup();
    prisma.telegramCustomEmojiPack.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deletePack('user-1', 'foreign-pack'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

import { BadRequestException } from '@nestjs/common';
import { ChannelAvatarEmojiDocumentsService } from './channel-avatar-emoji-documents.service';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';

type Asset = {
  hash: string;
  customEmojiId: string;
  imageUrl: string;
  pack: { id: number; shortName: string };
};
type Icon = { workspaceId: string; name: string; emoji: string };

function setup() {
  const assets: Asset[] = [
    {
      hash: 'old-photo',
      customEmojiId: '501234567890001',
      imageUrl: 'data:image/png;base64,b2xk',
      pack: { id: 1, shortName: 'channelavatars1_by_servicebot' },
    },
    {
      hash: 'new-photo',
      customEmojiId: '501234567890002',
      imageUrl: 'data:image/png;base64,bmV3',
      pack: { id: 1, shortName: 'channelavatars1_by_servicebot' },
    },
    {
      hash: 'foreign-photo',
      customEmojiId: '501234567890003',
      imageUrl: 'data:image/png;base64,Zm9yZWlnbg==',
      pack: { id: 1, shortName: 'channelavatars1_by_servicebot' },
    },
  ];
  const icons: Icon[] = [
    {
      workspaceId: 'workspace-a',
      name: 'channel-avatar:old-photo',
      emoji: '![📢](tg://emoji?id=501234567890001)',
    },
    {
      workspaceId: 'workspace-a',
      name: 'channel-avatar:new-photo',
      emoji: '![📢](tg://emoji?id=501234567890002)',
    },
    {
      workspaceId: 'workspace-b',
      name: 'channel-avatar:foreign-photo',
      emoji: '![📢](tg://emoji?id=501234567890003)',
    },
  ];
  const prisma = {
    channelAvatarEmojiAsset: {
      findMany: jest.fn(
        ({ where }: { where: { customEmojiId: { in: string[] } } }) =>
          Promise.resolve(
            assets.filter((asset) =>
              where.customEmojiId.in.includes(asset.customEmojiId),
            ),
          ),
      ),
      findUnique: jest.fn(({ where }: { where: { customEmojiId: string } }) =>
        Promise.resolve(
          assets.find((asset) => asset.customEmojiId === where.customEmojiId) ??
            null,
        ),
      ),
    },
    channelAvatarEmojiPack: {
      findFirst: jest.fn(
        ({ where }: { where: { shortName: { equals: string } } }) =>
          Promise.resolve(
            assets.find(
              (asset) =>
                asset.pack.shortName.toLowerCase() ===
                where.shortName.equals.toLowerCase(),
            )?.pack ?? null,
          ),
      ),
    },
    icon: {
      findMany: jest.fn(
        ({
          where,
        }: {
          where: { workspaceId: string; name: { in: string[] } };
        }) =>
          Promise.resolve(
            icons.filter(
              (icon) =>
                icon.workspaceId === where.workspaceId &&
                where.name.in.includes(icon.name),
            ),
          ),
      ),
    },
    telegramCustomEmojiPack: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    telegramUserAccountIntegration: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const workspaces = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-a'),
  };
  const mtproto = { getCustomEmojiPack: jest.fn() };
  const storage = { uploadMany: jest.fn() };
  const documents = new ChannelAvatarEmojiDocumentsService(prisma as never);
  const service = new TelegramCustomEmojiService(
    prisma as never,
    workspaces as never,
    { decrypt: jest.fn().mockReturnValue('decrypted') } as never,
    mtproto as never,
    storage as never,
    documents,
  );
  return {
    assets,
    icons,
    prisma,
    workspaces,
    mtproto,
    storage,
    documents,
    service,
  };
}

describe('System channel avatar emoji document separation', () => {
  it('resolves only requested workspace-owned avatar documents without importing their shared pack', async () => {
    const { service, assets, mtproto, storage, prisma } = setup();
    const importing = jest.spyOn(service, 'importPack');
    const result = await service.resolveDocuments('user-a', [
      assets[0].customEmojiId,
      assets[1].customEmojiId,
    ]);
    expect(result).toMatchObject({ loaded: 2, failed: 0, total: 2 });
    expect(result.packs).toHaveLength(1);
    expect(result.packs[0].id).toBe('channel-avatar:1');
    expect(result.packs[0].emojis.map((emoji) => emoji.documentId)).toEqual(
      assets.slice(0, 2).map((asset) => asset.customEmojiId),
    );
    expect(result.packs[0].emojis[0].assetUrl).toBe(assets[0].imageUrl);
    expect(importing).not.toHaveBeenCalled();
    expect(mtproto.getCustomEmojiPack).not.toHaveBeenCalled();
    expect(storage.uploadMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.telegramCustomEmojiPack.upsert).not.toHaveBeenCalled();
  });

  it('continues to resolve a historical avatar from its retained Icon after the current avatar changes', async () => {
    const { service, assets, prisma } = setup();
    // Both version Icons are retained; no current channel pointer is consulted.
    const result = await service.resolveDocuments('user-a', [
      assets[0].customEmojiId,
    ]);
    expect(result.packs[0].emojis).toHaveLength(1);
    expect(result.packs[0].emojis[0].documentId).toBe(assets[0].customEmojiId);
    expect(prisma.icon.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-a',
          type: 'emoji',
          name: { in: ['channel-avatar:old-photo'] },
        },
      }),
    );
  });

  it('does not expose another workspace avatar or fetch the global pack when its ID is requested', async () => {
    const { service, assets, mtproto, storage, prisma } = setup();
    const result = await service.resolveDocuments('user-a', [
      assets[2].customEmojiId,
    ]);
    expect(result).toMatchObject({ loaded: 0, failed: 1, packs: [] });
    expect(mtproto.getCustomEmojiPack).not.toHaveBeenCalled();
    expect(
      prisma.telegramUserAccountIntegration.findFirst,
    ).not.toHaveBeenCalled();
    expect(storage.uploadMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires both the workspace hash name and the matching canonical document ID', async () => {
    const { documents, assets, icons } = setup();
    icons[0].emoji = `![📢](tg://emoji?id=${assets[2].customEmojiId})`;
    expect(
      await documents.resolve('workspace-a', [assets[0].customEmojiId]),
    ).toEqual([]);
    icons[0].emoji = '📢';
    expect(
      await documents.resolve('workspace-a', [assets[0].customEmojiId]),
    ).toEqual([]);
  });

  it('keeps the ordinary pack list limited to user imports', async () => {
    const { service, prisma } = setup();
    await expect(service.list('user-a')).resolves.toEqual({ packs: [] });
    expect(prisma.channelAvatarEmojiAsset.findMany).not.toHaveBeenCalled();
    expect(prisma.icon.findMany).not.toHaveBeenCalled();
  });

  it('retains virtual avatar summaries after an unrelated document import replaces the imported-pack response', async () => {
    const { service, assets } = setup();
    const importedPack = {
      id: 'user-pack',
      shortName: 'flowers',
      title: 'Flowers',
      telegramLink: 'https://t.me/addemoji/flowers',
      emojis: [],
    };
    const importing = jest
      .spyOn(service, 'importPack')
      .mockResolvedValue({ packs: [importedPack] });
    const progress = jest.fn();
    const result = await service.resolveDocuments(
      'user-a',
      ['501234567890099', assets[0].customEmojiId],
      progress,
    );
    expect(importing).toHaveBeenCalledTimes(1);
    expect(importing).toHaveBeenCalledWith('user-a', {
      source: '501234567890099',
    });
    expect(result.packs.map((pack) => pack.id)).toEqual([
      'user-pack',
      'channel-avatar:1',
    ]);
    expect(progress).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        documentId: assets[0].customEmojiId,
        status: 'cached',
      }),
      2,
      2,
    );
  });

  it.each(['document', 'name'] as const)(
    'rejects an explicit system pack import by %s before MTProto, storage or persistence',
    async (kind) => {
      const { service, assets, prisma, mtproto, storage } = setup();
      const source =
        kind === 'document'
          ? assets[0].customEmojiId
          : `https://t.me/addemoji/${assets[0].pack.shortName.toUpperCase()}`;
      await expect(service.importPack('user-a', { source })).rejects.toThrow(
        'managed by the system',
      );
      expect(prisma.telegramCustomEmojiPack.findUnique).not.toHaveBeenCalled();
      expect(
        prisma.telegramUserAccountIntegration.findFirst,
      ).not.toHaveBeenCalled();
      expect(mtproto.getCustomEmojiPack).not.toHaveBeenCalled();
      expect(storage.uploadMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('blocks an unknown document once MTProto identifies its system pack before persisting its other documents', async () => {
    const { service, assets, prisma, mtproto, storage } = setup();
    prisma.telegramUserAccountIntegration.findFirst.mockResolvedValue({
      apiId: 123,
      apiHashEncrypted: 'hash',
      apiHashIv: 'iv',
      apiHashAuthTag: 'tag',
      sessionEncrypted: 'session',
      sessionIv: 'iv',
      sessionAuthTag: 'tag',
    });
    mtproto.getCustomEmojiPack.mockResolvedValue({
      shortName: assets[0].pack.shortName,
      documents: [],
    });
    await expect(
      service.importPack('user-a', { source: '501234567890098' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mtproto.getCustomEmojiPack).toHaveBeenCalledTimes(1);
    expect(storage.uploadMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

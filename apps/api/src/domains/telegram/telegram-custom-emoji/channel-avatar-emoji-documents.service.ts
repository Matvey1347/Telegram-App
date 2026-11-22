import { BadRequestException, Injectable } from '@nestjs/common';
import type { TelegramCustomEmojiPackSummary } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { storedTelegramIconPresentation } from '@api/telegram/shared/bot/telegram-bot-icon-source';

/** Exposes only immutable system documents already represented by this workspace's Icons. */
@Injectable()
export class ChannelAvatarEmojiDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<TelegramCustomEmojiPackSummary[]> {
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId },
      select: { avatarEmojiIconId: true, presentationIconId: true },
    });
    const iconIds = [
      ...new Set(
        channels.flatMap((channel) =>
          [channel.avatarEmojiIconId, channel.presentationIconId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    if (!iconIds.length) return [];
    const icons = await this.prisma.icon.findMany({
      where: {
        workspaceId,
        id: { in: iconIds },
        type: 'emoji',
        emoji: { not: null },
      },
      select: { name: true, emoji: true },
    });
    const documentIds = icons
      .map((icon) => {
        if (!icon.emoji) return null;
        const presentation = storedTelegramIconPresentation(icon.emoji, '📢');
        return presentation.type === 'unicode'
          ? presentation.telegramCustomEmojiId
          : null;
      })
      .filter((id): id is string => Boolean(id));
    return this.resolve(workspaceId, documentIds);
  }

  async resolve(
    workspaceId: string,
    documentIds: string[],
  ): Promise<TelegramCustomEmojiPackSummary[]> {
    if (!documentIds.length) return [];
    const assets = await this.prisma.channelAvatarEmojiAsset.findMany({
      where: { customEmojiId: { in: documentIds } },
      select: {
        hash: true,
        customEmojiId: true,
        imageUrl: true,
        pack: { select: { id: true, shortName: true } },
      },
    });
    if (!assets.length) return [];
    const icons = await this.prisma.icon.findMany({
      where: {
        workspaceId,
        type: 'emoji',
        name: { in: assets.map((asset) => `channel-avatar:${asset.hash}`) },
      },
      select: { name: true, emoji: true },
    });
    const owned = new Map(
      icons.map((icon) => [
        icon.name,
        storedTelegramIconPresentation(icon.emoji, '📢'),
      ]),
    );
    const packs = new Map<number, TelegramCustomEmojiPackSummary>();
    for (const asset of assets) {
      const presentation = owned.get(`channel-avatar:${asset.hash}`);
      if (
        !asset.pack ||
        !asset.customEmojiId ||
        presentation?.type !== 'unicode' ||
        presentation.telegramCustomEmojiId !== asset.customEmojiId
      )
        continue;
      const pack = packs.get(asset.pack.id) ?? {
        id: `channel-avatar:${asset.pack.id}`,
        shortName: asset.pack.shortName,
        title: 'Channel avatars',
        telegramLink: `https://t.me/addemoji/${asset.pack.shortName}`,
        emojis: [],
      };
      pack.emojis.push({
        id: `channel-avatar:${asset.hash}`,
        documentId: asset.customEmojiId,
        alt: presentation.value,
        mimeType: 'image/png',
        kind: 'STATIC',
        isFree: false,
        needsRepainting: false,
        position: pack.emojis.length,
        assetUrl: asset.imageUrl,
        renderAssetUrl: null,
      });
      packs.set(asset.pack.id, pack);
    }
    return [...packs.values()];
  }

  async assertImportable(input: {
    documentId?: string | null;
    shortName?: string | null;
  }) {
    const systemDocument = input.documentId
      ? await this.prisma.channelAvatarEmojiAsset.findUnique({
          where: { customEmojiId: input.documentId },
          select: { hash: true },
        })
      : null;
    const systemPack = input.shortName
      ? await this.prisma.channelAvatarEmojiPack.findFirst({
          where: {
            shortName: { equals: input.shortName, mode: 'insensitive' },
          },
          select: { id: true },
        })
      : null;
    if (systemDocument || systemPack)
      throw new BadRequestException(
        'Channel avatar emoji packs are managed by the system and cannot be imported as workspace packs. Use the channel avatar emoji settings.',
      );
  }
}

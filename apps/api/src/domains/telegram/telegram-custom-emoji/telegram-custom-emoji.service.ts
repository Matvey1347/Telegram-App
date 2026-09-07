import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ImportTelegramCustomEmojiPackInput,
  TelegramCustomEmojiPackSummary,
  TelegramWorkspaceCustomEmojiPacksResponse,
} from '@telegram-system/shared';
import type { Prisma } from '@prisma/client';
import { gunzipSync } from 'node:zlib';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramCustomEmojiPackSource } from '../../../telegram/shared/telegram-custom-emoji-pack';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramCustomEmojiStorageService } from './telegram-custom-emoji-storage.service';

const packSelect = {
  id: true,
  shortName: true,
  title: true,
  telegramLink: true,
  emojis: {
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      documentId: true,
      alt: true,
      mimeType: true,
      kind: true,
      isFree: true,
      needsRepainting: true,
      position: true,
      assetUrl: true,
      renderAssetUrl: true,
    },
  },
} as const;
type PackRow = Prisma.TelegramCustomEmojiPackGetPayload<{
  select: typeof packSelect;
}>;

@Injectable()
export class TelegramCustomEmojiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly encryption: TokenEncryptionService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly storage: TelegramCustomEmojiStorageService,
  ) {}

  private mapPack(pack: PackRow): TelegramCustomEmojiPackSummary {
    return {
      ...pack,
      emojis: pack.emojis.map((emoji) => ({
        ...emoji,
        kind: emoji.kind as 'STATIC' | 'ANIMATED' | 'VIDEO',
        assetUrl: emoji.assetUrl ?? null,
        renderAssetUrl: emoji.renderAssetUrl ?? null,
      })),
    };
  }

  async list(
    userId: string,
  ): Promise<TelegramWorkspaceCustomEmojiPacksResponse> {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const packs = await this.prisma.telegramCustomEmojiPack.findMany({
      where: { workspaceId, archivedAt: null },
      select: packSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { packs: packs.map((pack) => this.mapPack(pack)) };
  }

  private tgsJson(asset: Buffer) {
    try {
      return gunzipSync(asset);
    } catch {
      throw new BadRequestException(
        'Telegram returned an invalid TGS animation.',
      );
    }
  }

  async importPack(userId: string, input: ImportTelegramCustomEmojiPackInput) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const shortName = normalizeTelegramCustomEmojiPackSource(input.source);
    const existing = await this.prisma.telegramCustomEmojiPack.findUnique({
      where: { workspaceId_shortName: { workspaceId, shortName } },
      select: { id: true, archivedAt: true },
    });
    if (existing) {
      if (existing.archivedAt) {
        await this.prisma.telegramCustomEmojiPack.update({
          where: { id: existing.id },
          data: { archivedAt: null },
        });
      }
      return this.list(userId);
    }

    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: {
        workspaceId,
        isActive: true,
        status: 'connected',
        sessionEncrypted: { not: null },
        sessionIv: { not: null },
        sessionAuthTag: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!account)
      throw new BadRequestException(
        'Connect an active MTProto Telegram account before importing Premium emoji.',
      );
    const resolved = await this.mtproto.getCustomEmojiPack({
      source: input.source,
      apiId: account.apiId,
      apiHash: this.encryption.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      }),
      session: this.encryption.decrypt({
        encrypted: account.sessionEncrypted!,
        iv: account.sessionIv!,
        authTag: account.sessionAuthTag!,
      }),
    });
    if (!resolved.documents.length)
      throw new BadRequestException(
        'Telegram pack contains no Custom Emoji documents.',
      );

    const assets = resolved.documents.flatMap((emoji) => {
      if (!emoji.originalAsset) return [];
      const prefix = `telegram-custom-emoji/${workspaceId}/${resolved.shortName}/${emoji.documentId}`;
      const ext =
        emoji.kind === 'VIDEO'
          ? 'webm'
          : emoji.kind === 'ANIMATED'
            ? 'tgs'
            : 'webp';
      return [
        {
          key: `${prefix}/original.${ext}`,
          bytes: emoji.originalAsset,
          mimeType: emoji.mimeType ?? 'application/octet-stream',
        },
        ...(emoji.kind === 'ANIMATED'
          ? [
              {
                key: `${prefix}/render.json`,
                bytes: this.tgsJson(emoji.originalAsset),
                mimeType: 'application/json',
              },
            ]
          : []),
      ];
    });
    const urls = await this.storage.uploadMany(assets);
    await this.prisma.$transaction(async (tx) => {
      const pack = await tx.telegramCustomEmojiPack.upsert({
        where: {
          workspaceId_shortName: { workspaceId, shortName: resolved.shortName },
        },
        create: {
          workspaceId,
          shortName: resolved.shortName,
          title: resolved.title,
          telegramSetId: resolved.telegramSetId,
          telegramLink: `https://t.me/addemoji/${resolved.shortName}`,
        },
        update: {
          title: resolved.title,
          telegramSetId: resolved.telegramSetId,
          telegramLink: `https://t.me/addemoji/${resolved.shortName}`,
        },
        select: { id: true },
      });
      await tx.telegramCustomEmoji.createMany({
        data: resolved.documents.map((emoji, position) => {
          const prefix = `telegram-custom-emoji/${workspaceId}/${resolved.shortName}/${emoji.documentId}`;
          const ext =
            emoji.kind === 'VIDEO'
              ? 'webm'
              : emoji.kind === 'ANIMATED'
                ? 'tgs'
                : 'webp';
          return {
            packId: pack.id,
            documentId: emoji.documentId,
            alt: emoji.alt,
            mimeType: emoji.mimeType,
            kind: emoji.kind,
            isFree: emoji.isFree,
            needsRepainting: emoji.needsRepainting,
            position,
            assetKey: `${prefix}/original.${ext}`,
            assetUrl: urls.get(`${prefix}/original.${ext}`) ?? null,
            renderAssetKey:
              emoji.kind === 'ANIMATED' ? `${prefix}/render.json` : null,
            renderAssetUrl:
              emoji.kind === 'ANIMATED'
                ? (urls.get(`${prefix}/render.json`) ?? null)
                : null,
          };
        }),
        skipDuplicates: true,
      });
    });
    return this.list(userId);
  }

  async deletePack(userId: string, packId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const archived = await this.prisma.telegramCustomEmojiPack.updateMany({
      where: { id: packId, workspaceId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (archived.count === 0)
      throw new NotFoundException('Premium emoji pack not found.');
    return this.list(userId);
  }
}

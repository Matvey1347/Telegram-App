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
import { normalizeTelegramCustomEmojiPackSource } from '@api/telegram/shared/markup/telegram-custom-emoji-pack';
import { parseTelegramCustomEmojiDocumentId } from '@api/telegram/shared/markup/telegram-custom-emoji-pack';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
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

  /**
   * Imported posts only contain custom-emoji document IDs. Resolve unknown
   * IDs lazily when such a post is opened, instead of showing their ordinary
   * ALT characters in the editor preview. One resolved document imports its
   * complete pack, so subsequent IDs from that pack cause no MTProto work.
   */
  async ensureDocuments(userId: string, input: string[]) {
    const result = await this.resolveDocuments(userId, input);
    return { packs: result.packs };
  }

  async resolveDocuments(
    userId: string,
    input: string[],
    onProgress?: (
      item: {
        documentId: string;
        status: 'loaded' | 'cached' | 'failed';
        message: string;
        pack?: TelegramCustomEmojiPackSummary;
      },
      current: number,
      total: number,
    ) => void,
    signal?: AbortSignal,
  ) {
    const documentIds = [
      ...new Set(
        input
          .map((value) => String(value).trim())
          .filter((value) => /^\d{1,20}$/.test(value)),
      ),
    ].slice(0, 100);
    let response = await this.list(userId);
    const knownDocumentIds = new Set(
      response.packs.flatMap((pack) =>
        pack.emojis.map((emoji) => emoji.documentId),
      ),
    );
    let loaded = 0;
    let failed = 0;
    for (const [index, documentId] of documentIds.entries()) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const current = index + 1;
      const existingPack = response.packs.find((pack) =>
        pack.emojis.some((emoji) => emoji.documentId === documentId),
      );
      if (existingPack) {
        loaded += 1;
        onProgress?.(
          {
            documentId,
            status: 'cached',
            message: 'Premium emoji is already available.',
            pack: {
              ...existingPack,
              emojis: existingPack.emojis.filter(
                (emoji) => emoji.documentId === documentId,
              ),
            },
          },
          current,
          documentIds.length,
        );
        continue;
      }
      try {
        response = await this.importPack(userId, { source: documentId });
        response.packs.forEach((pack) =>
          pack.emojis.forEach((emoji) =>
            knownDocumentIds.add(emoji.documentId),
          ),
        );
        const pack = response.packs.find((candidate) =>
          candidate.emojis.some((emoji) => emoji.documentId === documentId),
        );
        loaded += 1;
        onProgress?.(
          {
            documentId,
            status: 'loaded',
            message: 'Premium emoji loaded.',
            ...(pack
              ? {
                  pack: {
                    ...pack,
                    emojis: pack.emojis.filter(
                      (emoji) => emoji.documentId === documentId,
                    ),
                  },
                }
              : {}),
          },
          current,
          documentIds.length,
        );
      } catch {
        failed += 1;
        onProgress?.(
          {
            documentId,
            status: 'failed',
            message: 'Premium emoji could not be loaded.',
          },
          current,
          documentIds.length,
        );
      }
    }
    return { ...response, loaded, failed, total: documentIds.length };
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
    const documentId = parseTelegramCustomEmojiDocumentId(input.source);
    const requestedShortName = documentId
      ? null
      : normalizeTelegramCustomEmojiPackSource(input.source);
    if (requestedShortName) {
      const existing = await this.prisma.telegramCustomEmojiPack.findUnique({
        where: {
          workspaceId_shortName: { workspaceId, shortName: requestedShortName },
        },
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
      return emoji.kind === 'ANIMATED'
        ? [
            {
              key: `${prefix}/render.json`,
              bytes: this.tgsJson(emoji.originalAsset),
              mimeType: 'application/json',
            },
          ]
        : [
            {
              key: `${prefix}/original.${ext}`,
              bytes: emoji.originalAsset,
              mimeType: emoji.mimeType ?? 'application/octet-stream',
            },
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
            assetKey:
              emoji.kind === 'ANIMATED' ? null : `${prefix}/original.${ext}`,
            assetUrl:
              emoji.kind === 'ANIMATED'
                ? null
                : (urls.get(`${prefix}/original.${ext}`) ?? null),
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

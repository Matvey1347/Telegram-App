import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ImportTelegramCustomEmojiPackInput, TelegramChannelCustomEmojiPacksResponse, TelegramCustomEmojiPackSummary, TelegramCustomEmojiPackTarget } from '@telegram-system/shared';
import { gunzipSync } from 'node:zlib';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { normalizeTelegramCustomEmojiPackSource } from '../../../telegram/shared/telegram-custom-emoji-pack';
import { TelegramCustomEmojiStorageService } from './telegram-custom-emoji-storage.service';

const packSelect = { id: true, shortName: true, title: true, telegramLink: true, emojis: { orderBy: { position: 'asc' as const }, select: { id: true, documentId: true, alt: true, mimeType: true, kind: true, isFree: true, needsRepainting: true, position: true, assetUrl: true, renderAssetUrl: true } } } as const;
type TargetInput = TelegramCustomEmojiPackTarget | { scope: 'CHANNELS' | 'ALL_CHANNELS'; channelIds?: string[] };

@Injectable()
export class TelegramCustomEmojiService {
  constructor(private readonly prisma: PrismaService, private readonly workspaceService: WorkspaceService, private readonly encryption: TokenEncryptionService, private readonly mtproto: TelegramMtprotoClient, private readonly storage: TelegramCustomEmojiStorageService) {}
  private workspace(userId: string) { return this.workspaceService.resolveWorkspaceIdForUser(userId); }
  private mapPack(pack: any): TelegramCustomEmojiPackSummary {
    return { ...pack, emojis: pack.emojis.map((emoji: any) => ({ ...emoji, kind: emoji.kind as 'STATIC' | 'ANIMATED' | 'VIDEO', assetUrl: emoji.assetUrl ?? null, renderAssetUrl: emoji.renderAssetUrl ?? null })) };
  }
  private async channels(workspaceId: string, fallbackChannelId: string, target?: TargetInput) {
    const scope = target?.scope ?? 'CHANNELS';
    const targetChannelIds = target && 'channelIds' in target ? target.channelIds : undefined;
    const requested: string[] | undefined = scope === 'ALL_CHANNELS' ? undefined : [...new Set((targetChannelIds?.length ? targetChannelIds : [fallbackChannelId]).filter(Boolean))];
    if (scope === 'CHANNELS' && !requested?.length) throw new BadRequestException('Select at least one Telegram channel.');
    const rows = await this.prisma.telegramChannel.findMany({ where: { workspaceId, ...(requested ? { id: { in: requested } } : {}) }, select: { id: true } });
    if (requested && rows.length !== requested.length) throw new NotFoundException('One or more Telegram channels do not belong to this workspace.');
    if (!rows.some((row) => row.id === fallbackChannelId)) {
      const fallback = await this.prisma.telegramChannel.findFirst({ where: { id: fallbackChannelId, workspaceId }, select: { id: true } });
      if (!fallback) throw new NotFoundException('Telegram channel not found.');
    }
    return rows.map((row) => row.id);
  }
  private async attachMany(channelIds: string[], packId: string) {
    await this.prisma.telegramChannelCustomEmojiPack.createMany({ data: channelIds.map((channelId) => ({ channelId, packId })), skipDuplicates: true });
  }
  async list(userId: string, channelId: string): Promise<TelegramChannelCustomEmojiPacksResponse> {
    const workspaceId = await this.workspace(userId);
    await this.channels(workspaceId, channelId, { scope: 'CHANNELS', channelIds: [channelId] });
    const links = await this.prisma.telegramChannelCustomEmojiPack.findMany({ where: { channelId, pack: { workspaceId } }, select: { pack: { select: packSelect } }, orderBy: { createdAt: 'asc' } });
    return { channelId, packs: links.map(({ pack }) => this.mapPack(pack)) };
  }
  private tgsJson(asset: Buffer) {
    try { return gunzipSync(asset); } catch { throw new BadRequestException('Telegram returned an invalid TGS animation.'); }
  }
  async importPack(userId: string, channelId: string, input: ImportTelegramCustomEmojiPackInput) {
    const workspaceId = await this.workspace(userId);
    const channelIds = await this.channels(workspaceId, channelId, {
      scope: input.scope,
      channelIds: input.channelIds,
    });
    const shortName = normalizeTelegramCustomEmojiPackSource(input.source);
    const existing = await this.prisma.telegramCustomEmojiPack.findUnique({ where: { workspaceId_shortName: { workspaceId, shortName } }, select: { id: true } });
    if (existing) { await this.attachMany(channelIds, existing.id); return this.list(userId, channelId); }
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({ where: { workspaceId, isActive: true, status: 'connected', sessionEncrypted: { not: null }, sessionIv: { not: null }, sessionAuthTag: { not: null } }, orderBy: { updatedAt: 'desc' } });
    if (!account) throw new BadRequestException('Connect an active MTProto Telegram account before importing Premium emoji.');
    const resolved = await this.mtproto.getCustomEmojiPack({ source: input.source, apiId: account.apiId, apiHash: this.encryption.decrypt({ encrypted: account.apiHashEncrypted, iv: account.apiHashIv, authTag: account.apiHashAuthTag }), session: this.encryption.decrypt({ encrypted: account.sessionEncrypted!, iv: account.sessionIv!, authTag: account.sessionAuthTag! }) });
    if (!resolved.documents.length) throw new BadRequestException('Telegram pack contains no Custom Emoji documents.');
    const assets = resolved.documents.flatMap((emoji) => {
      if (!emoji.originalAsset) return [];
      const prefix = `telegram-custom-emoji/${workspaceId}/${resolved.shortName}/${emoji.documentId}`;
      const originalExt = emoji.kind === 'VIDEO' ? 'webm' : emoji.kind === 'ANIMATED' ? 'tgs' : 'webp';
      return [{ key: `${prefix}/original.${originalExt}`, bytes: emoji.originalAsset, mimeType: emoji.mimeType ?? 'application/octet-stream' }, ...(emoji.kind === 'ANIMATED' ? [{ key: `${prefix}/render.json`, bytes: this.tgsJson(emoji.originalAsset), mimeType: 'application/json' }] : [])];
    });
    const urls = await this.storage.uploadMany(assets);
    const pack = await this.prisma.$transaction(async (tx) => {
      const created = await tx.telegramCustomEmojiPack.upsert({ where: { workspaceId_shortName: { workspaceId, shortName: resolved.shortName } }, create: { workspaceId, shortName: resolved.shortName, title: resolved.title, telegramSetId: resolved.telegramSetId, telegramLink: `https://t.me/addemoji/${resolved.shortName}` }, update: { title: resolved.title, telegramSetId: resolved.telegramSetId, telegramLink: `https://t.me/addemoji/${resolved.shortName}` }, select: { id: true } });
      await tx.telegramCustomEmoji.createMany({ data: resolved.documents.map((emoji, position) => { const prefix = `telegram-custom-emoji/${workspaceId}/${resolved.shortName}/${emoji.documentId}`; return { packId: created.id, documentId: emoji.documentId, alt: emoji.alt, mimeType: emoji.mimeType, kind: emoji.kind, isFree: emoji.isFree, needsRepainting: emoji.needsRepainting, position, assetKey: `${prefix}/original.${emoji.kind === 'VIDEO' ? 'webm' : emoji.kind === 'ANIMATED' ? 'tgs' : 'webp'}`, assetUrl: urls.get(`${prefix}/original.${emoji.kind === 'VIDEO' ? 'webm' : emoji.kind === 'ANIMATED' ? 'tgs' : 'webp'}`) ?? null, renderAssetKey: emoji.kind === 'ANIMATED' ? `${prefix}/render.json` : null, renderAssetUrl: emoji.kind === 'ANIMATED' ? urls.get(`${prefix}/render.json`) ?? null : null }; }), skipDuplicates: true });
      await tx.telegramChannelCustomEmojiPack.createMany({ data: channelIds.map((id) => ({ channelId: id, packId: created.id })), skipDuplicates: true });
      return created;
    });
    return this.list(userId, channelId);
  }
  async attach(userId: string, channelId: string, packId: string, target: TargetInput) {
    const workspaceId = await this.workspace(userId); const channelIds = await this.channels(workspaceId, channelId, target);
    const pack = await this.prisma.telegramCustomEmojiPack.findFirst({ where: { id: packId, workspaceId }, select: { id: true } });
    if (!pack) throw new NotFoundException('Premium emoji pack not found.'); await this.attachMany(channelIds, packId); return this.list(userId, channelId);
  }
  async detach(userId: string, channelId: string, packId: string, target: TargetInput) {
    const workspaceId = await this.workspace(userId); const channelIds = await this.channels(workspaceId, channelId, target);
    await this.prisma.telegramChannelCustomEmojiPack.deleteMany({ where: { channelId: { in: channelIds }, packId, pack: { workspaceId } } }); return this.list(userId, channelId);
  }
}

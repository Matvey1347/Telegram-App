import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TelegramUserAccountStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  B2ObjectStorageService,
  isSupportedImmutableImageMimeType,
} from '../../../common/object-storage/b2-object-storage.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';

export type TelegramPostMediaBackfillSummary = {
  considered: number;
  alreadyStored: number;
  base64Migrated: number;
  telegramDownloaded: number;
  b2Uploaded: number;
  b2Reused: number;
  unsupportedMedia: number;
  failed: number;
};

type BackfillFilters = {
  workspaceId?: string;
  channelId?: string;
  limit?: number;
};

@Injectable()
export class TelegramPostMediaBackfillService {
  private readonly logger = new Logger(TelegramPostMediaBackfillService.name);
  private readonly batchSize = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: B2ObjectStorageService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async run(filters: BackfillFilters = {}) {
    const remaining =
      filters.limit == null
        ? Number.MAX_SAFE_INTEGER
        : Math.max(1, Math.min(filters.limit, 10_000));
    const summary: TelegramPostMediaBackfillSummary = {
      considered: 0,
      alreadyStored: 0,
      base64Migrated: 0,
      telegramDownloaded: 0,
      b2Uploaded: 0,
      b2Reused: 0,
      unsupportedMedia: 0,
      failed: 0,
    };
    await this.migrateManagedPostDataUrls(filters, remaining, summary);
    const synchronizedLimit = Math.max(0, remaining - summary.considered);
    if (synchronizedLimit > 0) {
      await this.backfillSynchronizedPosts(
        filters,
        synchronizedLimit,
        summary,
      );
    }
    return summary;
  }

  private async migrateManagedPostDataUrls(
    filters: BackfillFilters,
    limit: number,
    summary: TelegramPostMediaBackfillSummary,
  ) {
    let cursor = '';
    let processed = 0;
    while (processed < limit) {
      const rows = await this.prisma.$queryRaw<
        Array<{ id: string; imageUrls: string[] }>
      >(Prisma.sql`
        SELECT "id", "imageUrls"
        FROM "TelegramManagedPost"
        WHERE "origin" = 'TELEGRAM'::"TelegramManagedPostOrigin"
          AND "id" > ${cursor}
          ${filters.workspaceId ? Prisma.sql`AND "workspaceId" = ${filters.workspaceId}` : Prisma.empty}
          ${filters.channelId ? Prisma.sql`AND "telegramChannelId" = ${filters.channelId}` : Prisma.empty}
          AND EXISTS (
            SELECT 1 FROM unnest("imageUrls") AS image_url
            WHERE image_url ~* '^data:image/(jpeg|png|webp|gif);base64,[a-z0-9+/=[:space:]]+$'
          )
        ORDER BY "id" ASC
        LIMIT ${Math.min(this.batchSize, limit - processed)}
      `);
      if (!rows.length) break;
      cursor = rows.at(-1)?.id ?? cursor;
      processed += rows.length;
      for (const row of rows) {
        summary.considered += 1;
        const parsed = row.imageUrls.map((url) => this.parseDataImage(url));
        const legacy = parsed.flatMap((value, index) =>
          value ? [{ ...value, index }] : [],
        );
        if (!legacy.length) {
          if (row.imageUrls.some((url) => /^https?:\/\//i.test(url))) {
            summary.alreadyStored += 1;
          }
          continue;
        }
        try {
          const stored = await this.storage.persistImmutableImages(legacy);
          const next = [...row.imageUrls];
          legacy.forEach((item, index) => {
            next[item.index] = stored.urls[index];
          });
          await this.prisma.telegramManagedPost.update({
            where: { id: row.id },
            data: { imageUrls: next },
          });
          summary.base64Migrated += legacy.length;
          summary.b2Uploaded += stored.uploaded;
          summary.b2Reused += stored.reused;
        } catch (error) {
          summary.failed += 1;
          this.warn(row.id, error);
        }
      }
      if (
        rows.length < Math.min(this.batchSize, limit - processed + rows.length)
      )
        break;
    }
  }

  private async backfillSynchronizedPosts(
    filters: BackfillFilters,
    limit: number,
    summary: TelegramPostMediaBackfillSummary,
  ) {
    let cursor: string | undefined;
    let processed = 0;
    while (processed < limit) {
      const rows = await this.prisma.telegramPost.findMany({
        where: {
          hasMedia: true,
          imageUrls: { equals: [] },
          ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
          ...(filters.channelId
            ? { telegramChannelId: filters.channelId }
            : {}),
        },
        select: {
          id: true,
          workspaceId: true,
          telegramChannelId: true,
          telegramMessageId: true,
          mediaKind: true,
          telegramChannel: {
            select: {
              id: true,
              username: true,
              telegramChatId: true,
              inviteLink: true,
              telegramAccessHash: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        take: Math.min(this.batchSize, limit - processed),
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      cursor = rows.at(-1)?.id;
      processed += rows.length;
      summary.considered += rows.length;
      const images = rows.filter((row) =>
        /photo|image/i.test(row.mediaKind || ''),
      );
      summary.unsupportedMedia += rows.length - images.length;
      const byChannel = new Map<string, typeof images>();
      for (const row of images) {
        const key = `${row.workspaceId}:${row.telegramChannelId}`;
        byChannel.set(key, [...(byChannel.get(key) ?? []), row]);
      }
      for (const channelRows of byChannel.values()) {
        const first = channelRows[0];
        if (!first) continue;
        try {
          const credentials = await this.accountCredentialsForChannel(
            first.workspaceId,
            first.telegramChannelId,
          );
          const downloaded = await this.mtproto.downloadChannelMessagesMedia({
            ...credentials,
            channel: first.telegramChannel,
            messageIds: channelRows.map((row) => row.telegramMessageId),
          });
          const imageMedia = downloaded.filter((item) =>
            isSupportedImmutableImageMimeType(item.mimeType),
          );
          const stored = await this.storage.persistImmutableImages(
            imageMedia.map((item) => ({
              bytes: item.buffer,
              mimeType: item.mimeType,
            })),
          );
          const urlByMessageId = new Map(
            imageMedia.map((item, index) => [
              item.messageId,
              stored.urls[index],
            ]),
          );
          for (const row of channelRows) {
            const url = urlByMessageId.get(row.telegramMessageId);
            if (!url) {
              summary.failed += 1;
              continue;
            }
            await this.prisma.telegramPost.update({
              where: { id: row.id },
              data: { imageUrls: [url] },
            });
            summary.telegramDownloaded += 1;
          }
          summary.b2Uploaded += stored.uploaded;
          summary.b2Reused += stored.reused;
        } catch (error) {
          summary.failed += channelRows.length;
          this.warn(first.telegramChannelId, error);
        }
      }
      if (rows.length < this.batchSize) break;
    }
  }

  private async accountCredentialsForChannel(
    workspaceId: string,
    channelId: string,
  ) {
    const linkedAdmin = await this.prisma.telegramChannelAdminLink.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'asc' },
      select: { telegramUserAccountIntegrationId: true },
    });
    if (!linkedAdmin) throw new Error('No connected Telegram account.');
    const account =
      await this.prisma.telegramUserAccountIntegration.findFirst({
        where: {
          id: linkedAdmin.telegramUserAccountIntegrationId,
          workspaceId,
          isActive: true,
          status: TelegramUserAccountStatus.connected,
        },
        select: {
          apiId: true,
          apiHashEncrypted: true,
          apiHashIv: true,
          apiHashAuthTag: true,
          sessionEncrypted: true,
          sessionIv: true,
          sessionAuthTag: true,
        },
      });
    if (
      !account?.sessionEncrypted ||
      !account.sessionIv ||
      !account.sessionAuthTag
    ) {
      throw new Error('Telegram account session is unavailable.');
    }
    return {
      apiId: account.apiId,
      apiHash: this.encryption.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      }),
      session: this.encryption.decrypt({
        encrypted: account.sessionEncrypted,
        iv: account.sessionIv,
        authTag: account.sessionAuthTag,
      }),
    };
  }

  private parseDataImage(url: string) {
    const match =
      /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(
        url,
      );
    if (!match) return null;
    const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    return bytes.length ? { bytes, mimeType: match[1].toLowerCase() } : null;
  }

  private warn(id: string, error: unknown) {
    this.logger.warn(
      `Telegram post media backfill item failed for id=${id}: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  }
}

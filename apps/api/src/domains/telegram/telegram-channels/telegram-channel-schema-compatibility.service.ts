import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TelegramChannelSchemaCompatibilityService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly logger = new Logger('TelegramChannelsService');

  private telegramManagedPostOriginColumnsAvailable: boolean | null = null;

  private ensureTelegramManagedPostOriginColumnsPromise: Promise<void> | null =
    null;

  private telegramChannelSyncScopeColumnsAvailable: boolean | null = null;

  private ensureTelegramChannelSyncScopeColumnsPromise: Promise<void> | null =
    null;

  private telegramChannelImportPolicyColumnsAvailable: boolean | null = null;

  private ensureTelegramChannelImportPolicyColumnsPromise: Promise<void> | null =
    null;

  private postGroupSystemColumnsAvailable: boolean | null = null;

  private ensurePostGroupSystemColumnsPromise: Promise<void> | null = null;

  public isMissingTelegramManagedPostOriginColumns(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /Unknown arg(?:ument)? [`'"]origin[`'"]/i.test(message) ||
      /Unknown arg(?:ument)? [`'"]remoteImportKey[`'"]/i.test(message) ||
      /column [`'"](?:TelegramManagedPost|TelegramManagedPostRevision)\.(?:origin|remoteImportKey)\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"](?:origin|remoteImportKey) of relation (?:TelegramManagedPost|TelegramManagedPostRevision)[`'"] does not exist/i.test(
        message,
      ) ||
      /type [`'"]TelegramManagedPostOrigin[`'"] does not exist/i.test(message)
    );
  }

  public async ensureTelegramManagedPostOriginColumnsAvailable() {
    if (this.telegramManagedPostOriginColumnsAvailable === true) return;
    if (this.ensureTelegramManagedPostOriginColumnsPromise) {
      return this.ensureTelegramManagedPostOriginColumnsPromise;
    }
    this.ensureTelegramManagedPostOriginColumnsPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_type WHERE typname = 'TelegramManagedPostOrigin'
            ) THEN
              CREATE TYPE "TelegramManagedPostOrigin" AS ENUM ('SYSTEM', 'TELEGRAM');
            END IF;
          END
          $$;
        `);
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "TelegramManagedPost"
          ADD COLUMN IF NOT EXISTS "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
          ADD COLUMN IF NOT EXISTS "remoteImportKey" TEXT
        `);
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "TelegramManagedPostRevision"
          ADD COLUMN IF NOT EXISTS "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
          ADD COLUMN IF NOT EXISTS "remoteImportKey" TEXT
        `);
      this.telegramManagedPostOriginColumnsAvailable = true;
      this.logger.warn(
        'TelegramManagedPost origin/import columns were missing in the database and were created automatically for compatibility.',
      );
    })();
    try {
      await this.ensureTelegramManagedPostOriginColumnsPromise;
    } finally {
      this.ensureTelegramManagedPostOriginColumnsPromise = null;
    }
  }

  public isMissingTelegramChannelSyncScopeColumn(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /column [`'"](?:TelegramChannel\.)?syncInclude[A-Za-z]+\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"]syncInclude[A-Za-z]+ of relation TelegramChannel[`'"] does not exist/i.test(
        message,
      )
    );
  }

  public async ensureTelegramChannelSyncScopeColumnsAvailable() {
    if (this.telegramChannelSyncScopeColumnsAvailable === true) return;
    if (this.ensureTelegramChannelSyncScopeColumnsPromise) {
      return this.ensureTelegramChannelSyncScopeColumnsPromise;
    }
    this.ensureTelegramChannelSyncScopeColumnsPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "TelegramChannel"
          ADD COLUMN IF NOT EXISTS "syncIncludePublicInfo" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludeInviteLinks" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludeHistoricalPosts" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludePostMetrics" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludeOlderPosts" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludeChannelStats" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludeManagedPosts" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "syncIncludeAudienceSnapshot" BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT true
        `);
      this.telegramChannelSyncScopeColumnsAvailable = true;
      this.logger.warn(
        'TelegramChannel sync-scope columns were missing in the database and were created automatically for compatibility.',
      );
    })();
    try {
      await this.ensureTelegramChannelSyncScopeColumnsPromise;
    } finally {
      this.ensureTelegramChannelSyncScopeColumnsPromise = null;
    }
  }

  async ensureTelegramChannelImportPolicyColumnsAvailable() {
    if (this.telegramChannelImportPolicyColumnsAvailable === true) return;
    if (this.ensureTelegramChannelImportPolicyColumnsPromise) {
      return this.ensureTelegramChannelImportPolicyColumnsPromise;
    }
    if (typeof this.prisma.$executeRawUnsafe !== 'function') {
      this.telegramChannelImportPolicyColumnsAvailable = false;
      return false;
    }
    this.ensureTelegramChannelImportPolicyColumnsPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_type
              WHERE typname = 'TelegramChannelAcquisitionType'
            ) THEN
              CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');
            END IF;
          END $$;
        `);
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "TelegramChannel"
          ADD COLUMN IF NOT EXISTS "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED',
          ADD COLUMN IF NOT EXISTS "postsSyncFrom" TIMESTAMP(3),
          ADD COLUMN IF NOT EXISTS "inviteLinksSyncFrom" TIMESTAMP(3),
          ADD COLUMN IF NOT EXISTS "purchaseTransactionId" TEXT
        `);
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "TelegramInviteLink"
          ADD COLUMN IF NOT EXISTS "telegramCreatedAt" TIMESTAMP(3)
        `);
      await this.prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS "TelegramChannel_purchaseTransactionId_key"
          ON "TelegramChannel"("purchaseTransactionId")
        `);
      await this.prisma.$executeRawUnsafe(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1
              FROM pg_constraint
              WHERE conname = 'TelegramChannel_purchaseTransactionId_fkey'
            ) THEN
              ALTER TABLE "TelegramChannel"
              ADD CONSTRAINT "TelegramChannel_purchaseTransactionId_fkey"
              FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id")
              ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
          END $$;
        `);
      this.telegramChannelImportPolicyColumnsAvailable = true;
      this.logger.warn(
        'TelegramChannel import-policy columns were missing in the database and were created automatically for compatibility.',
      );
    })();
    try {
      await this.ensureTelegramChannelImportPolicyColumnsPromise;
    } finally {
      this.ensureTelegramChannelImportPolicyColumnsPromise = null;
    }
  }

  public isMissingPostGroupSystemColumns(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /column [`'"](?:PostGroup\.)?(?:isSystem|systemKey)\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"](?:isSystem|systemKey) of relation PostGroup[`'"] does not exist/i.test(
        message,
      )
    );
  }

  public async ensurePostGroupSystemColumnsAvailable() {
    if (this.postGroupSystemColumnsAvailable === true) return;
    if (this.ensurePostGroupSystemColumnsPromise) {
      return this.ensurePostGroupSystemColumnsPromise;
    }
    this.ensurePostGroupSystemColumnsPromise = (async () => {
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "PostGroup"
          ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS "systemKey" TEXT
        `);
      await this.prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS "PostGroup_telegramChannelId_systemKey_key"
          ON "PostGroup"("telegramChannelId", "systemKey")
        `);
      this.postGroupSystemColumnsAvailable = true;
      this.logger.warn(
        'PostGroup system columns were missing in the database and were created automatically for compatibility.',
      );
    })();
    try {
      await this.ensurePostGroupSystemColumnsPromise;
    } finally {
      this.ensurePostGroupSystemColumnsPromise = null;
    }
  }

  public isMissingTimePostsTable(error: unknown) {
    const code = (error as { code?: string } | undefined)?.code;
    const cause = (
      error as {
        meta?: {
          driverAdapterError?: {
            cause?: { originalCode?: string; table?: string };
          };
        };
      }
    )?.meta?.driverAdapterError?.cause;

    return (
      code === 'P2010' &&
      cause?.originalCode === '42P01' &&
      cause?.table === 'TelegramChannelTimePost'
    );
  }

  public async timePostsByChannelIds(channelIds: string[]) {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    if (!uniqueChannelIds.length) return grouped;

    let rows: Array<{
      id: string;
      telegramChannelId: string;
      title: string;
      time: string;
      position: number;
      iconId: string | null;
      icon_id: string | null;
      icon_type: string | null;
      icon_name: string | null;
      icon_emoji: string | null;
      icon_image_url: string | null;
    }>;
    try {
      rows = await this.prisma.$queryRaw(Prisma.sql`
          SELECT
            tp."id",
            tp."telegramChannelId",
            tp."title",
            tp."time",
            tp."position",
            tp."iconId",
            i."id" AS "icon_id",
            i."type" AS "icon_type",
            i."name" AS "icon_name",
            i."emoji" AS "icon_emoji",
            i."imageUrl" AS "icon_image_url"
          FROM "TelegramChannelTimePost" tp
          JOIN "TelegramChannel" c ON c."id" = tp."telegramChannelId"
          LEFT JOIN "Icon" i ON i."id" = tp."iconId"
            AND (i."workspaceId" = c."workspaceId" OR i."workspaceId" IS NULL)
          WHERE tp."telegramChannelId" IN (${Prisma.join(
            uniqueChannelIds.map((id) => Prisma.sql`${id}`),
          )})
          ORDER BY tp."position" ASC, tp."createdAt" ASC
        `);
    } catch (error) {
      if (this.isMissingTimePostsTable(error)) {
        this.logger.warn(
          'TelegramChannelTimePost table is missing; returning empty time posts until migrations are applied.',
        );
        return grouped;
      }
      throw error;
    }

    for (const row of rows) {
      const items = grouped.get(row.telegramChannelId) ?? [];
      items.push({
        id: row.id,
        title: row.title,
        time: row.time,
        position: row.position,
        iconId: row.iconId,
        iconPresentation: iconToResolvedEmoji(
          row.icon_id
            ? {
                id: row.icon_id,
                type: row.icon_type as 'emoji' | 'image',
                name: row.icon_name,
                emoji: row.icon_emoji,
                imageUrl: row.icon_image_url,
              }
            : null,
        ),
      });
      grouped.set(row.telegramChannelId, items);
    }

    return grouped;
  }
}

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { stripLegacyGroupedPostTitlePrefix } from './post-groups.helpers';
import {
  ManagedPostRevisionRecord,
  ManagedPostRevisionSource,
} from './telegram-channels.internal';

@Injectable()
export class TelegramManagedPostRevisionStore {
  constructor(private readonly prisma: PrismaService) {}

  private readonly managedPostRevisionRetentionMs = 7 * 24 * 60 * 60 * 1000;

  private managedPostRevisionStorageState: 'unknown' | 'available' | 'missing' =
    'unknown';

  public managedPostRevisionData(
    post: ManagedPostRevisionSource,
    reason: string,
  ) {
    return {
      telegramManagedPostId: post.id,
      workspaceId: post.workspaceId,
      telegramChannelId: post.telegramChannelId,
      title: post.groupId
        ? stripLegacyGroupedPostTitlePrefix(
            post.title,
            post.groupPosition == null ? null : post.groupPosition + 1,
          )
        : post.title,
      text: post.text,
      imageUrls: [...post.imageUrls],
      buttonRows: normalizeTelegramPostButtonRows(post.buttonRows),
      origin: post.origin,
      remoteImportKey: post.remoteImportKey,
      status: post.status,
      scheduledAt: post.scheduledAt,
      scheduleMode: post.scheduleMode ?? null,
      publishedAt: post.publishedAt,
      telegramScheduledMessageIds: [
        ...(post.telegramScheduledMessageIds ?? []),
      ],
      telegramMessageIds: [...post.telegramMessageIds],
      telegramMessageUrls: [...post.telegramMessageUrls],
      telegramIdVerificationStatus:
        post.telegramIdVerificationStatus ??
        TelegramManagedPostIdVerificationStatus.UNVERIFIED,
      telegramLinkSource:
        post.telegramLinkSource ?? TelegramManagedPostLinkSource.AUTO,
      telegramIdVerifiedAt: post.telegramIdVerifiedAt ?? null,
      telegramIdLastCheckedAt: post.telegramIdLastCheckedAt ?? null,
      telegramRemoteStatus: post.telegramRemoteStatus,
      lastTelegramSyncedAt: post.lastTelegramSyncedAt,
      lastTelegramSyncNote: post.lastTelegramSyncNote,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      sourceWasPremium:
        (
          post as ManagedPostRevisionSource & {
            sourceWasPremium?: boolean | null;
          }
        ).sourceWasPremium ?? null,
      captionLengthMaxUsed:
        (
          post as ManagedPostRevisionSource & {
            captionLengthMaxUsed?: number | null;
          }
        ).captionLengthMaxUsed ?? null,
      messageLengthMaxUsed:
        (
          post as ManagedPostRevisionSource & {
            messageLengthMaxUsed?: number | null;
          }
        ).messageLengthMaxUsed ?? null,
      publishMode: post.publishMode,
      lastError: post.lastError,
      assignedMemberId: post.assignedMemberId,
      icon: post.icon,
      groupId: post.groupId,
      groupPosition: post.groupPosition,
      statusPosition: post.statusPosition ?? null,
      sidebarPosition: post.sidebarPosition,
      reason,
    };
  }

  public managedPostRevisionDelegate(
    client: Prisma.TransactionClient | PrismaService,
  ) {
    return (
      client as PrismaService & {
        telegramManagedPostRevision: {
          create: (args: {
            data: ReturnType<typeof this.managedPostRevisionData>;
          }) => Promise<unknown>;
          deleteMany: (args: {
            where: Record<string, unknown>;
          }) => Promise<unknown>;
          findMany: (args: Record<string, unknown>) => Promise<unknown>;
          findFirst: (args: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).telegramManagedPostRevision;
  }

  public managedPostRevisionQueryClient(
    client: Prisma.TransactionClient | PrismaService,
  ) {
    return client as Prisma.TransactionClient & {
      $queryRaw<T = unknown>(
        query: TemplateStringsArray | Prisma.Sql,
        ...values: unknown[]
      ): Promise<T>;
      $executeRaw(
        query: TemplateStringsArray | Prisma.Sql,
        ...values: unknown[]
      ): Promise<number>;
    };
  }

  public isManagedPostRevisionTableMissing(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code === 'P2021') return true;
    if (error.code !== 'P2010') return false;
    const originalCode =
      (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode ?? null;
    return originalCode === '42P01';
  }

  public async hasManagedPostRevisionStorage() {
    if (this.managedPostRevisionStorageState === 'available') return true;
    if (this.managedPostRevisionStorageState === 'missing') return false;
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ exists: string | null }>
      >(
        Prisma.sql`
            SELECT to_regclass('"TelegramManagedPostRevision"')::text AS "exists"
          `,
      );
      const exists = Boolean(rows[0]?.exists);
      this.managedPostRevisionStorageState = exists ? 'available' : 'missing';
      return exists;
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return false;
      }
      throw error;
    }
  }

  public async insertManagedPostRevisionRaw(
    client: Prisma.TransactionClient | PrismaService,
    data: ReturnType<typeof this.managedPostRevisionData>,
  ) {
    const db = this.managedPostRevisionQueryClient(client);
    const revisionId = randomUUID();
    try {
      await db.$executeRaw(Prisma.sql`
          INSERT INTO "TelegramManagedPostRevision" (
            "id",
            "telegramManagedPostId",
            "workspaceId",
            "telegramChannelId",
            "title",
            "text",
            "imageUrls",
            "buttonRows",
            "origin",
            "remoteImportKey",
            "status",
            "scheduledAt",
            "scheduleMode",
            "publishedAt",
            "telegramScheduledMessageIds",
            "telegramMessageIds",
            "telegramMessageUrls",
            "telegramIdVerificationStatus",
            "telegramLinkSource",
            "telegramIdVerifiedAt",
            "telegramIdLastCheckedAt",
            "telegramRemoteStatus",
            "lastTelegramSyncedAt",
            "lastTelegramSyncNote",
            "sourceType",
            "sourceId",
            "publishMode",
            "lastError",
            "assignedMemberId",
            "icon",
            "groupId",
            "groupPosition",
            "statusPosition",
            "sidebarPosition",
            "reason"
          ) VALUES (
            ${revisionId},
            ${data.telegramManagedPostId},
            ${data.workspaceId},
            ${data.telegramChannelId},
            ${data.title},
            ${data.text},
            ${data.imageUrls},
            ${JSON.stringify(data.buttonRows)},
            CAST(${data.origin} AS "TelegramManagedPostOrigin"),
            ${data.remoteImportKey},
            CAST(${data.status} AS "TelegramManagedPostStatus"),
            ${data.scheduledAt},
            ${data.scheduleMode},
            ${data.publishedAt},
            ${data.telegramScheduledMessageIds},
            ${data.telegramMessageIds},
            ${data.telegramMessageUrls},
            CAST(${data.telegramIdVerificationStatus} AS "TelegramManagedPostIdVerificationStatus"),
            CAST(${data.telegramLinkSource} AS "TelegramManagedPostLinkSource"),
            ${data.telegramIdVerifiedAt},
            ${data.telegramIdLastCheckedAt},
            CAST(${data.telegramRemoteStatus} AS "TelegramManagedPostRemoteStatus"),
            ${data.lastTelegramSyncedAt},
            ${data.lastTelegramSyncNote},
            ${data.sourceType ? Prisma.sql`CAST(${data.sourceType} AS "TelegramSourceType")` : Prisma.sql`NULL`},
            ${data.sourceId},
            ${data.publishMode},
            ${data.lastError},
            ${data.assignedMemberId},
            ${data.icon},
            ${data.groupId},
            ${data.groupPosition},
            ${data.statusPosition},
            ${data.sidebarPosition},
            ${data.reason}
          )
        `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return false;
      }
      throw error;
    }
    this.managedPostRevisionStorageState = 'available';
    return true;
  }

  public async listManagedPostRevisions(
    client: Prisma.TransactionClient | PrismaService,
    where: { telegramManagedPostId: string; workspaceId: string },
  ) {
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        return (await delegate.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 30,
        })) as ManagedPostRevisionRecord[];
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return [];
        }
        throw error;
      }
    }
    const db = this.managedPostRevisionQueryClient(client);
    try {
      return await db.$queryRaw<ManagedPostRevisionRecord[]>(Prisma.sql`
          SELECT *
          FROM "TelegramManagedPostRevision"
          WHERE "telegramManagedPostId" = ${where.telegramManagedPostId}
            AND "workspaceId" = ${where.workspaceId}
          ORDER BY "createdAt" DESC
          LIMIT 30
        `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return [];
      }
      throw error;
    }
  }

  public async findManagedPostRevision(
    client: Prisma.TransactionClient | PrismaService,
    where: {
      id: string;
      telegramManagedPostId: string;
      workspaceId: string;
      telegramChannelId: string;
    },
  ) {
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        return (await delegate.findFirst({
          where,
        })) as ManagedPostRevisionRecord | null;
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return null;
        }
        throw error;
      }
    }
    const db = this.managedPostRevisionQueryClient(client);
    let rows: ManagedPostRevisionRecord[];
    try {
      rows = await db.$queryRaw<ManagedPostRevisionRecord[]>(Prisma.sql`
          SELECT *
          FROM "TelegramManagedPostRevision"
          WHERE "id" = ${where.id}
            AND "telegramManagedPostId" = ${where.telegramManagedPostId}
            AND "workspaceId" = ${where.workspaceId}
            AND "telegramChannelId" = ${where.telegramChannelId}
          LIMIT 1
        `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return null;
      }
      throw error;
    }
    return rows[0] ?? null;
  }

  public async deleteExpiredManagedPostRevisions(
    client: Prisma.TransactionClient | PrismaService,
    postId: string,
  ) {
    const cutoff = new Date(Date.now() - this.managedPostRevisionRetentionMs);
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        await delegate.deleteMany({
          where: {
            telegramManagedPostId: postId,
            createdAt: { lt: cutoff },
          },
        });
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return;
        }
        throw error;
      }
      return;
    }
    const db = this.managedPostRevisionQueryClient(client);
    try {
      await db.$executeRaw(Prisma.sql`
          DELETE FROM "TelegramManagedPostRevision"
          WHERE "telegramManagedPostId" = ${postId}
            AND "createdAt" < ${cutoff}
        `);
    } catch (error) {
      if (this.isManagedPostRevisionTableMissing(error)) {
        this.managedPostRevisionStorageState = 'missing';
        return;
      }
      throw error;
    }
  }

  public async createManagedPostRevision(
    client: Prisma.TransactionClient | PrismaService,
    post: ManagedPostRevisionSource,
    reason: string,
  ) {
    const storageAvailable = await this.hasManagedPostRevisionStorage();
    if (!storageAvailable) return;
    const data = this.managedPostRevisionData(post, reason);
    const delegate = this.managedPostRevisionDelegate(client);
    if (delegate) {
      try {
        await delegate.create({ data });
      } catch (error) {
        if (this.isManagedPostRevisionTableMissing(error)) {
          this.managedPostRevisionStorageState = 'missing';
          return;
        }
        throw error;
      }
    } else {
      const inserted = await this.insertManagedPostRevisionRaw(client, data);
      if (!inserted) return;
    }
    await this.deleteExpiredManagedPostRevisions(client, post.id);
  }
}

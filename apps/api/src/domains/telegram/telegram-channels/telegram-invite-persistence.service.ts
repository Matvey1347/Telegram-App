import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { maskTelegramInviteUrl } from '../../../telegram/shared/telegram-invite-log';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';

@Injectable()
export class TelegramInvitePersistenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  private readonly inviteLinkReadSelectWithoutRequestedCount = {
    id: true,
    workspaceId: true,
    telegramChannelId: true,
    adCampaignId: true,
    name: true,
    url: true,
    telegramInviteLinkId: true,
    createdBy: true,
    createsJoinRequest: true,
    expireDate: true,
    memberLimit: true,
    joinedCount: true,
    isRevoked: true,
    lastSyncedAt: true,
    creatorTelegramUserId: true,
    creatorUsername: true,
    creatorFirstName: true,
    creatorLastName: true,
    creatorPhotoUrl: true,
    creatorMemberId: true,
    creatorMatchSource: true,
    createdAt: true,
    updatedAt: true,
    adCampaign: { select: { id: true, title: true } },
    creatorMember: WorkspaceService.assignedMemberInclude,
  } as const;

  private readonly inviteLinkSyncUpsertSelect = {
    id: true,
    workspaceId: true,
    telegramChannelId: true,
    adCampaignId: true,
    joinedCount: true,
    requestedCount: true,
    isRevoked: true,
  } as const;

  private telegramInviteLinkRequestedCountSupported: boolean | null = null;

  private telegramInviteLinkRequestedCountColumnAvailable: boolean | null =
    null;

  private ensureTelegramInviteLinkRequestedCountColumnPromise: Promise<boolean> | null =
    null;

  public isRequestedCountUnsupportedPrismaError(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    return (
      /Unknown arg(?:ument)? [`'"]requestedCount[`'"]/i.test(message) ||
      /column [`'"](?:TelegramInviteLink\.)?requestedCount\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"]requestedCount of relation TelegramInviteLink[`'"] does not exist/i.test(
        message,
      )
    );
  }

  public requestedCountCompatibilityReason(error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '';
    if (/Unknown arg(?:ument)? [`'"]requestedCount[`'"]/i.test(message)) {
      return 'outdated_prisma_client';
    }
    if (
      /column [`'"](?:TelegramInviteLink\.)?requestedCount\b.*does not exist(?: in the current database)?/i.test(
        message,
      ) ||
      /column [`'"]requestedCount of relation TelegramInviteLink[`'"] does not exist/i.test(
        message,
      )
    ) {
      return 'database_column_missing';
    }
    return 'unknown';
  }

  public supportsTelegramInviteLinkRequestedCount() {
    if (this.telegramInviteLinkRequestedCountSupported != null) {
      return this.telegramInviteLinkRequestedCountSupported;
    }
    const inviteLinkModel = Prisma.dmmf.datamodel.models.find(
      (model) => model.name === 'TelegramInviteLink',
    );
    this.telegramInviteLinkRequestedCountSupported = Boolean(
      inviteLinkModel?.fields.some((field) => field.name === 'requestedCount'),
    );
    return this.telegramInviteLinkRequestedCountSupported;
  }

  public async ensureTelegramInviteLinkRequestedCountColumnAvailable() {
    if (!this.supportsTelegramInviteLinkRequestedCount()) {
      return false;
    }
    if (this.telegramInviteLinkRequestedCountColumnAvailable === true) {
      return true;
    }
    if (this.ensureTelegramInviteLinkRequestedCountColumnPromise) {
      return this.ensureTelegramInviteLinkRequestedCountColumnPromise;
    }
    this.ensureTelegramInviteLinkRequestedCountColumnPromise = (async () => {
      if (typeof this.prisma.$executeRawUnsafe !== 'function') {
        return false;
      }
      await this.prisma.$executeRawUnsafe(`
          ALTER TABLE "TelegramInviteLink"
          ADD COLUMN IF NOT EXISTS "requestedCount" INTEGER NOT NULL DEFAULT 0
        `);
      this.telegramInviteLinkRequestedCountColumnAvailable = true;
      this.logger.warn(
        'TelegramInviteLink.requestedCount column was missing and was created automatically for compatibility.',
      );
      return true;
    })();
    try {
      await this.ensureTelegramInviteLinkRequestedCountColumnPromise;
    } finally {
      this.ensureTelegramInviteLinkRequestedCountColumnPromise = null;
    }
    return Boolean(this.telegramInviteLinkRequestedCountColumnAvailable);
  }

  public canWriteTelegramInviteLinkRequestedCount() {
    return (
      this.supportsTelegramInviteLinkRequestedCount() &&
      this.telegramInviteLinkRequestedCountColumnAvailable !== false
    );
  }

  public inviteLinkReadSelect(includeRequestedCount: boolean) {
    if (!includeRequestedCount) {
      return this.inviteLinkReadSelectWithoutRequestedCount;
    }
    return {
      ...this.inviteLinkReadSelectWithoutRequestedCount,
      requestedCount: true,
    } as const;
  }

  public normalizeInviteLinkRequestedCount<T extends object>(
    link: T,
  ): T & { requestedCount: number } {
    const value = link as T & {
      requestedCount?: number | null;
      creatorMember?: {
        avatarIcon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
      } | null;
    };
    return {
      ...link,
      requestedCount: Number(value.requestedCount ?? 0),
      creatorMember: value.creatorMember
        ? this.telegramManagedPostGroupPresentationService.memberSummary(
            value.creatorMember,
          )
        : value.creatorMember,
    };
  }

  public normalizeInviteLinksRequestedCount<T extends object>(
    links: T[],
  ): Array<T & { requestedCount: number }> {
    return links.map((link) => this.normalizeInviteLinkRequestedCount(link));
  }

  public inviteLinkRawWriteClient() {
    return this.prisma as PrismaService & {
      $queryRaw<T = unknown>(
        query: TemplateStringsArray | Prisma.Sql,
        ...values: unknown[]
      ): Promise<T>;
      $executeRaw?(
        query: TemplateStringsArray | Prisma.Sql,
        ...values: unknown[]
      ): Promise<number>;
    };
  }

  public inviteLinkLegacyColumnValue(column: string, value: unknown) {
    if (column === 'creatorMatchSource') {
      return value == null
        ? Prisma.sql`NULL`
        : Prisma.sql`CAST(${value} AS "TelegramInviteLinkCreatorMatchSource")`;
    }
    return Prisma.sql`${value}`;
  }

  public async persistInviteLinkWithoutRequestedCountRaw(params: {
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    existingId?: string;
  }) {
    const db = this.inviteLinkRawWriteClient();
    const timestamp = new Date();

    if (typeof db.$executeRaw !== 'function') {
      if (params.existingId) {
        return this.prisma.telegramInviteLink.update({
          where: { id: params.existingId },
          data: {
            ...(params.update as Prisma.TelegramInviteLinkUncheckedUpdateInput),
            updatedAt: timestamp,
          },
          select: this.inviteLinkSyncUpsertSelect,
        });
      }

      return this.prisma.telegramInviteLink.create({
        data: {
          id: randomUUID(),
          ...(params.create as Prisma.TelegramInviteLinkUncheckedCreateInput),
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        select: this.inviteLinkSyncUpsertSelect,
      });
    }

    if (params.existingId) {
      const updateData = {
        ...params.update,
        updatedAt: timestamp,
      };
      const assignments = Object.entries(updateData).map(
        ([column, value]) =>
          Prisma.sql`${Prisma.raw(`"${column}"`)} = ${this.inviteLinkLegacyColumnValue(column, value)}`,
      );

      await db.$executeRaw(Prisma.sql`
          UPDATE "TelegramInviteLink"
          SET ${Prisma.join(assignments, ', ')}
          WHERE "id" = ${params.existingId}
        `);
    } else {
      const insertData = {
        id: randomUUID(),
        ...params.create,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const columns = Object.keys(insertData).map((column) =>
        Prisma.raw(`"${column}"`),
      );
      const values = Object.entries(insertData).map(([column, value]) =>
        this.inviteLinkLegacyColumnValue(column, value),
      );

      await db.$executeRaw(Prisma.sql`
          INSERT INTO "TelegramInviteLink" (${Prisma.join(columns, ', ')})
          VALUES (${Prisma.join(values, ', ')})
        `);
    }

    const persisted = await this.prisma.telegramInviteLink.findFirst({
      where: {
        workspaceId: String(params.create.workspaceId),
        telegramChannelId: String(params.create.telegramChannelId),
        url: String(params.create.url),
      },
      select: this.inviteLinkSyncUpsertSelect,
    });
    if (!persisted) {
      throw new InternalServerErrorException(
        'Invite link was written via legacy path but could not be reloaded.',
      );
    }
    return persisted;
  }

  public async findInviteLinksWithRequestedCountFallback(params: {
    workspaceId: string;
    where: Prisma.TelegramInviteLinkWhereInput;
    orderBy?:
      | Prisma.TelegramInviteLinkOrderByWithRelationInput
      | Prisma.TelegramInviteLinkOrderByWithRelationInput[];
    skip?: number;
    take?: number;
  }) {
    const run = async (includeRequestedCount: boolean) => {
      const links = await this.prisma.telegramInviteLink.findMany({
        where: params.where,
        orderBy: params.orderBy,
        skip: params.skip,
        take: params.take,
        select: this.inviteLinkReadSelect(includeRequestedCount),
      });
      return this.normalizeInviteLinksRequestedCount(links);
    };

    if (this.telegramInviteLinkRequestedCountColumnAvailable === false) {
      return run(false);
    }

    try {
      return await run(this.supportsTelegramInviteLinkRequestedCount());
    } catch (error) {
      const reason = this.requestedCountCompatibilityReason(error);
      if (reason !== 'database_column_missing') {
        throw error;
      }
      this.telegramInviteLinkRequestedCountColumnAvailable = false;
      const repaired =
        await this.ensureTelegramInviteLinkRequestedCountColumnAvailable();
      return repaired ? run(true) : run(false);
    }
  }

  public async updateInviteLinkWithRequestedCountFallback(params: {
    where: Prisma.TelegramInviteLinkWhereUniqueInput;
    data: Prisma.TelegramInviteLinkUncheckedUpdateInput;
  }) {
    const run = async (includeRequestedCount: boolean) => {
      const link = await this.prisma.telegramInviteLink.update({
        where: params.where,
        data: params.data,
        select: this.inviteLinkReadSelect(includeRequestedCount),
      });
      return this.normalizeInviteLinkRequestedCount(link);
    };

    if (this.telegramInviteLinkRequestedCountColumnAvailable === false) {
      return run(false);
    }

    try {
      return await run(this.supportsTelegramInviteLinkRequestedCount());
    } catch (error) {
      const reason = this.requestedCountCompatibilityReason(error);
      if (reason !== 'database_column_missing') {
        throw error;
      }
      this.telegramInviteLinkRequestedCountColumnAvailable = false;
      const repaired =
        await this.ensureTelegramInviteLinkRequestedCountColumnAvailable();
      return repaired ? run(true) : run(false);
    }
  }

  public async persistInviteLinkWithoutRequestedCount(params: {
    workspaceId: string;
    channelId: string;
    url: string;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    existingId?: string;
  }) {
    const { requestedCount: _ignoredCreate, ...createWithoutRequestedCount } =
      params.create;
    const { requestedCount: _ignoredUpdate, ...updateWithoutRequestedCount } =
      params.update;
    void _ignoredCreate;
    void _ignoredUpdate;

    this.logger.warn(
      `Invite-link sync is using legacy persistence without requestedCount for channel=${params.channelId} url=${maskTelegramInviteUrl(params.url)} existing=${Boolean(params.existingId)}`,
    );

    if (params.existingId) {
      return this.persistInviteLinkWithoutRequestedCountRaw({
        create: createWithoutRequestedCount,
        update: updateWithoutRequestedCount,
        existingId: params.existingId,
      });
    }

    return this.persistInviteLinkWithoutRequestedCountRaw({
      create: createWithoutRequestedCount,
      update: updateWithoutRequestedCount,
    });
  }

  public async upsertInviteLinkWithRequestedCountFallback(params: {
    workspaceId: string;
    channelId: string;
    url: string;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
    existingId?: string;
  }) {
    if (!this.canWriteTelegramInviteLinkRequestedCount()) {
      return this.persistInviteLinkWithoutRequestedCount(params);
    }

    try {
      return await this.prisma.telegramInviteLink.upsert({
        where: {
          workspaceId_telegramChannelId_url: {
            workspaceId: params.workspaceId,
            telegramChannelId: params.channelId,
            url: params.url,
          },
        },
        create: params.create as never,
        update: params.update as never,
        select: this.inviteLinkSyncUpsertSelect,
      });
    } catch (error) {
      if (!this.isRequestedCountUnsupportedPrismaError(error)) {
        throw error;
      }

      const reason = this.requestedCountCompatibilityReason(error);
      if (reason === 'database_column_missing') {
        this.telegramInviteLinkRequestedCountColumnAvailable = false;
        const repaired =
          await this.ensureTelegramInviteLinkRequestedCountColumnAvailable();
        if (repaired) {
          return this.prisma.telegramInviteLink.upsert({
            where: {
              workspaceId_telegramChannelId_url: {
                workspaceId: params.workspaceId,
                telegramChannelId: params.channelId,
                url: params.url,
              },
            },
            create: params.create as never,
            update: params.update as never,
            select: this.inviteLinkSyncUpsertSelect,
          });
        }
        return this.persistInviteLinkWithoutRequestedCount(params);
      }

      // Dev watch can serve a still-running process with an outdated Prisma client,
      // and local/dev databases can lag behind the checked-in Prisma schema.
      // Retry without the new field instead of failing the stream.
      this.logger.warn(
        `Invite-link sync is retrying without requestedCount for channel=${params.channelId} url=${maskTelegramInviteUrl(params.url)} reason=${reason} runtimeSupportsRequestedCount=${this.supportsTelegramInviteLinkRequestedCount()} dbColumnAvailable=${this.telegramInviteLinkRequestedCountColumnAvailable !== false}`,
      );

      return this.prisma.telegramInviteLink.upsert({
        where: {
          workspaceId_telegramChannelId_url: {
            workspaceId: params.workspaceId,
            telegramChannelId: params.channelId,
            url: params.url,
          },
        },
        create: ((value) => {
          const rest = { ...value };
          delete rest.requestedCount;
          return rest;
        })(params.create) as never,
        update: ((value) => {
          const rest = { ...value };
          delete rest.requestedCount;
          return rest;
        })(params.update) as never,
        select: this.inviteLinkSyncUpsertSelect,
      });
    }
  }
}

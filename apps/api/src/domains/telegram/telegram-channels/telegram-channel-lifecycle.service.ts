import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { CreateTelegramChannelDto, UpdateTelegramChannelDto } from './dto';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelImportPolicyService } from './telegram-channel-import-policy.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramPostGroupStore } from './telegram-post-group.store';

@Injectable()
export class TelegramChannelLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelImportPolicyService: TelegramChannelImportPolicyService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramPostGroupStore: TelegramPostGroupStore,
  ) {}

  async create(userId: string, dto: CreateTelegramChannelDto) {
    const { workspaceId, assignedMemberId, currentMembership } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const channel = await this.prisma.$transaction(async (tx) => {
      const created = await (tx.telegramChannel as any).create({
        data: {
          workspaceId,
          ...dto,
          username: this.telegramChannelsSupportService.normalizeUsername(
            dto.username,
          ),
          assignedMemberId,
          createdByUserId: userId,
        },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
      await this.telegramPostGroupStore.ensureRequiredChannelSystemGroups(
        tx,
        workspaceId,
        created.id,
        assignedMemberId ?? currentMembership.id,
      );
      return created;
    });
    notifyScheduledTaskDueWorkChanged(`workspace-auto-sync:${workspaceId}`);
    return channel;
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    if (dto.kpiCurrency !== undefined)
      dto.kpiCurrency = dto.kpiCurrency.toUpperCase();
    if (dto.adBaseCurrency !== undefined)
      dto.adBaseCurrency = dto.adBaseCurrency.toUpperCase();
    const existing = await this.telegramChannelCatalogService.findOne(
      userId,
      id,
    );
    const goodUntil =
      dto.targetCpa === undefined
        ? existing.targetCpa == null
          ? null
          : Number(existing.targetCpa)
        : dto.targetCpa;
    const stopFrom =
      dto.stopCpaFrom === undefined
        ? existing.stopCpaFrom == null
          ? null
          : Number(existing.stopCpaFrom)
        : dto.stopCpaFrom;
    if (goodUntil != null && stopFrom != null && goodUntil >= stopFrom) {
      throw new BadRequestException('Good up to must be lower than Stop from');
    }
    const importPolicy =
      await this.telegramChannelImportPolicyService.resolveImportPolicy({
        workspaceId,
        channelId: id,
        input: dto,
        existing,
      });
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const { timePosts: _timePosts, ...channelUpdateData } = dto;
    void _timePosts;
    const normalizedTimePosts = dto.timePosts?.map((item, index) => ({
      id: randomUUID(),
      title: String(item.title || '').trim(),
      time: item.time,
      position: index,
      iconId: item.iconId ? String(item.iconId).trim() || null : null,
    }));
    if (normalizedTimePosts) {
      const iconIds = normalizedTimePosts
        .map((item) => item.iconId)
        .filter((iconId): iconId is string => Boolean(iconId));
      if (iconIds.length) {
        const icons = await this.prisma.icon.findMany({
          where: { workspaceId, id: { in: iconIds } },
          select: { id: true },
        });
        if (icons.length !== new Set(iconIds).size) {
          throw new BadRequestException(
            'One or more time post icons are invalid',
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx.telegramChannel as any).update({
        where: { id },
        data: {
          ...channelUpdateData,
          acquisitionType: importPolicy.acquisitionType,
          postsSyncFrom: importPolicy.postsSyncFrom,
          inviteLinksSyncFrom: importPolicy.inviteLinksSyncFrom,
          purchaseTransactionId: importPolicy.purchaseTransactionId,
          username:
            dto.username === undefined
              ? undefined
              : this.telegramChannelsSupportService.normalizeUsername(
                  dto.username,
                ),
          dataQualityNotes:
            dto.dataQualityNotes === undefined
              ? undefined
              : String(dto.dataQualityNotes || '').trim() || null,
          assignedMemberId,
        },
      });
      if (normalizedTimePosts !== undefined) {
        try {
          await tx.$executeRaw(
            Prisma.sql`DELETE FROM "TelegramChannelTimePost" WHERE "telegramChannelId" = ${id}`,
          );
          if (normalizedTimePosts.length) {
            await tx.$executeRaw(Prisma.sql`
                INSERT INTO "TelegramChannelTimePost" (
                  "id",
                  "telegramChannelId",
                  "iconId",
                  "title",
                  "time",
                  "position",
                  "createdAt",
                  "updatedAt"
                ) VALUES ${Prisma.join(
                  normalizedTimePosts.map(
                    (item) => Prisma.sql`(
                    ${item.id},
                    ${id},
                    ${item.iconId},
                    ${item.title},
                    ${item.time},
                    ${item.position},
                    NOW(),
                    NOW()
                  )`,
                  ),
                )}
              `);
          }
        } catch (error) {
          if (
            this.telegramChannelSchemaCompatibilityService.isMissingTimePostsTable(
              error,
            )
          ) {
            throw new InternalServerErrorException(
              'Time posts storage is not available yet. Apply the latest database migration and try again.',
            );
          }
          throw error;
        }
      }
    });

    notifyScheduledTaskDueWorkChanged(`workspace-auto-sync:${workspaceId}`);
    return this.telegramChannelCatalogService.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, id);
    const result = await this.prisma.$transaction(async (tx) => {
      const campaigns = await tx.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: id },
        select: { id: true },
      });
      const campaignIds = campaigns.map((campaign) => campaign.id);
      if (campaignIds.length) {
        await tx.transaction.deleteMany({
          where: { workspaceId, adCampaignId: { in: campaignIds } },
        });
      }
      await tx.promo.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramInviteLink.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.adCampaign.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramChannel.delete({ where: { id } });
      return { success: true };
    });
    notifyScheduledTaskDueWorkChanged(`workspace-auto-sync:${workspaceId}`);
    return result;
  }

  async archive(userId: string, id: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, id);
    const result = await this.prisma.telegramChannel.updateMany({
      where: { id, workspaceId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    // A conditional update avoids an unchanged-state write if the request races
    // with another archive operation or repeats after the channel is archived.
    if (!result.count)
      return this.telegramChannelCatalogService.findOne(userId, id);
    return this.telegramChannelCatalogService.findOne(userId, id);
  }

  async restore(userId: string, id: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, id);
    const result = await this.prisma.telegramChannel.updateMany({
      where: { id, workspaceId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });
    // Same conditional mutation makes restore idempotent without a no-op write.
    if (!result.count)
      return this.telegramChannelCatalogService.findOne(userId, id);
    return this.telegramChannelCatalogService.findOne(userId, id);
  }
}

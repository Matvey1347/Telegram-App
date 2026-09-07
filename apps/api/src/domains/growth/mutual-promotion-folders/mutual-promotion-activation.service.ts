import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MutualPromotionWorkKind, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  MutualPromotionActivationProgressHandler,
  MutualPromotionActivationResult,
} from '@telegram-system/shared';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { TelegramManagedPostPublicationService } from '../../telegram/telegram-channels/telegram-managed-post-publication.service';
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { runMutualPromotionBounded } from './mutual-promotion-lifecycle.utils';
import { MutualPromotionValidationService } from './mutual-promotion-validation.service';

type ActivationDelivery = {
  deliveryId: string;
  folderPostId: string;
  postTitle: string;
  workspaceId: string;
  telegramChannelId: string;
  channelTitle: string;
  managedPostId: string;
  scheduledAt: Date;
  mode: 'TELEGRAM_NATIVE' | 'LOCAL_SCHEDULER';
  alreadyScheduled: boolean;
};

@Injectable()
export class MutualPromotionActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly validation: MutualPromotionValidationService,
    private readonly read: MutualPromotionReadService,
    private readonly publication: TelegramManagedPostPublicationService,
  ) {}

  async activate(
    userId: string,
    folderId: string,
    onProgress?: MutualPromotionActivationProgressHandler,
  ): Promise<MutualPromotionActivationResult> {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    let deliveriesCreated = 0;
    let activationDeliveries: ActivationDelivery[] = [];
    const currentState = await this.prisma.mutualPromotionFolder.findFirst({
      where: { id: folderId, workspaceId: membership.workspaceId },
      select: { status: true, activatedAt: true },
    });
    if (!currentState) {
      throw new NotFoundException('Mutual-promotion folder not found');
    }
    if (currentState.status === 'SCHEDULED' && currentState.activatedAt) {
      activationDeliveries = await this.preparedDeliveries(
        membership.workspaceId,
        folderId,
      );
      deliveriesCreated = activationDeliveries.length;
    } else {
      await this.prisma.$transaction(async (tx) => {
        await this.validation.lockFolder(tx, folderId);
        const folder = await tx.mutualPromotionFolder.findFirst({
          where: { id: folderId, workspaceId: membership.workspaceId },
          include: {
            participants: { include: { telegramChannel: true } },
            posts: true,
          },
        });
        if (!folder)
          throw new NotFoundException('Mutual-promotion folder not found');
        this.validation.requireDraft(folder.status);
        const publishers = folder.participants.filter(
          (row) => row.role === 'PUBLISHER',
        );
        const now = new Date();
        if (folder.startsAt <= now)
          throw new BadRequestException('Folder start must be in the future');
        if (
          folder.participants.some(
            (participant) =>
              participant.telegramChannel.currentSubscribersCount === null,
          )
        ) {
          throw new BadRequestException(
            'Every participant channel needs a cached subscriber count before activation',
          );
        }
        if (!publishers.length)
          throw new BadRequestException('At least one publisher is required');
        if (folder.posts.length < 5)
          throw new BadRequestException(
            'At least five publications are required',
          );
        if (
          folder.posts.some(
            (post) =>
              post.scheduledAt < folder.startsAt ||
              post.scheduledAt >= folder.endsAt,
          )
        ) {
          throw new BadRequestException(
            'Every post time must be inside [start, end)',
          );
        }
        await this.validation.lockInviteLinks(
          tx,
          folder.participants.map((row) => row.inviteLinkId),
        );
        await this.validation.validateParticipants(tx, {
          workspaceId: folder.workspaceId,
          folderId: folder.id,
          startsAt: folder.startsAt,
          endsAt: folder.endsAt,
          participants: folder.participants,
        });
        const existingGroups = await tx.postGroup.findMany({
          where: {
            telegramChannelId: {
              in: publishers.map((row) => row.telegramChannelId),
            },
            systemKey: 'MUTUAL_PROMOTION',
          },
          select: { id: true, telegramChannelId: true },
        });
        const groupByChannel = new Map(
          existingGroups.map((group) => [group.telegramChannelId, group.id]),
        );
        const missingGroups = publishers
          .filter(
            (publisher) => !groupByChannel.has(publisher.telegramChannelId),
          )
          .map((publisher) => {
            const id = randomUUID();
            groupByChannel.set(publisher.telegramChannelId, id);
            return {
              id,
              workspaceId: folder.workspaceId,
              telegramChannelId: publisher.telegramChannelId,
              title: 'Mutual promotion',
              icon: '🤝',
              isSystem: true,
              systemKey: 'MUTUAL_PROMOTION',
              createdByMemberId:
                folder.assignedMemberId ??
                publisher.telegramChannel.assignedMemberId ??
                membership.id,
            };
          });
        if (missingGroups.length)
          await tx.postGroup.createMany({ data: missingGroups });

        const managedPosts: Prisma.TelegramManagedPostCreateManyInput[] = [];
        const deliveries: Prisma.MutualPromotionPostDeliveryCreateManyInput[] =
          [];
        for (const publisher of publishers) {
          const assignedMemberId =
            folder.assignedMemberId ??
            publisher.telegramChannel.assignedMemberId ??
            membership.id;
          for (const post of folder.posts) {
            const managedPostId = randomUUID();
            managedPosts.push({
              id: managedPostId,
              workspaceId: folder.workspaceId,
              telegramChannelId: publisher.telegramChannelId,
              title: post.title,
              text: post.text,
              imageUrls: post.imageUrls,
              buttonRows: post.buttonRows ?? Prisma.JsonNull,
              origin: 'SYSTEM',
              status: 'DRAFT',
              scheduledAt: post.scheduledAt,
              assignedMemberId,
              groupId: groupByChannel.get(publisher.telegramChannelId),
              groupPosition: post.position,
            });
            const deliveryId = randomUUID();
            const hasButtons = Boolean(
              normalizeTelegramPostButtonRows(post.buttonRows).length,
            );
            deliveries.push({
              id: deliveryId,
              workspaceId: folder.workspaceId,
              folderPostId: post.id,
              participantId: publisher.id,
              telegramChannelId: publisher.telegramChannelId,
              managedPostId,
            });
            activationDeliveries.push({
              deliveryId,
              folderPostId: post.id,
              postTitle: post.title,
              workspaceId: folder.workspaceId,
              telegramChannelId: publisher.telegramChannelId,
              channelTitle: publisher.telegramChannel.title,
              managedPostId,
              scheduledAt: post.scheduledAt,
              mode: hasButtons ? 'LOCAL_SCHEDULER' : 'TELEGRAM_NATIVE',
              alreadyScheduled: false,
            });
          }
        }
        await tx.telegramManagedPost.createMany({ data: managedPosts });
        await tx.mutualPromotionPostDelivery.createMany({ data: deliveries });
        deliveriesCreated = deliveries.length;
        await tx.mutualPromotionWorkItem.createMany({
          data: [
            this.work(
              folder,
              MutualPromotionWorkKind.CAPTURE_START_BASELINE,
              folder.startsAt,
              'start',
            ),
            ...folder.posts.map((post) =>
              this.work(
                folder,
                MutualPromotionWorkKind.PUBLISH_POST,
                post.scheduledAt,
                `publish:${post.id}`,
                {
                  folderPostId: post.id,
                },
              ),
            ),
            this.work(
              folder,
              MutualPromotionWorkKind.FINISH_FOLDER,
              folder.endsAt,
              'finish',
            ),
          ],
        });
        await tx.mutualPromotionFolder.update({
          where: { id: folder.id },
          data: {
            status: folder.startsAt > now ? 'SCHEDULED' : 'ACTIVE',
            activatedAt: now,
            nextDueAt: [
              folder.startsAt,
              ...folder.posts.map((post) => post.scheduledAt),
              folder.endsAt,
            ].sort((left, right) => left.getTime() - right.getTime())[0],
          },
        });
      });
    }
    const total = activationDeliveries.length;
    let completed = 0;
    let successCount = 0;
    let failedCount = 0;
    const telegramNativeCount = activationDeliveries.filter(
      (delivery) => delivery.mode === 'TELEGRAM_NATIVE',
    ).length;
    const localSchedulerCount = total - telegramNativeCount;
    onProgress?.(
      {
        deliveryId: null,
        folderPostId: null,
        postTitle: null,
        telegramChannelId: null,
        channelTitle: null,
        mode: null,
        status: 'PREPARING',
        success: null,
        message: `${total} channel publication(s) prepared. Starting Telegram scheduling…`,
      },
      0,
      total,
    );
    const schedulingErrors: string[] = [];
    const deliveriesByChannel = new Map<string, ActivationDelivery[]>();
    for (const delivery of activationDeliveries) {
      deliveriesByChannel.set(delivery.telegramChannelId, [
        ...(deliveriesByChannel.get(delivery.telegramChannelId) ?? []),
        delivery,
      ]);
    }
    await runMutualPromotionBounded(
      [...deliveriesByChannel.values()],
      4,
      async (channelDeliveries) => {
        for (const delivery of channelDeliveries) {
          if (delivery.mode === 'LOCAL_SCHEDULER') {
            completed += 1;
            successCount += 1;
            onProgress?.(
              this.progressItem(
                delivery,
                'SCHEDULED',
                true,
                `“${delivery.postTitle}” was saved for ${delivery.channelTitle}; inline buttons will be delivered by the local scheduler.`,
              ),
              completed,
              total,
            );
            continue;
          }
          if (delivery.alreadyScheduled) {
            completed += 1;
            successCount += 1;
            onProgress?.(
              this.progressItem(
                delivery,
                'SCHEDULED',
                true,
                `“${delivery.postTitle}” is already present in Telegram Scheduled Messages for ${delivery.channelTitle}.`,
              ),
              completed,
              total,
            );
            continue;
          }
          onProgress?.(
            this.progressItem(
              delivery,
              'SCHEDULING',
              null,
              `Sending “${delivery.postTitle}” to Telegram Scheduled Messages for ${delivery.channelTitle}…`,
            ),
            completed,
            total,
          );
          try {
            await this.publication.scheduleManagedPostNatively(
              delivery.workspaceId,
              delivery.telegramChannelId,
              delivery.managedPostId,
              delivery.scheduledAt,
            );
            completed += 1;
            successCount += 1;
            onProgress?.(
              this.progressItem(
                delivery,
                'SCHEDULED',
                true,
                `“${delivery.postTitle}” was added to Telegram Scheduled Messages for ${delivery.channelTitle}.`,
              ),
              completed,
              total,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            schedulingErrors.push(message);
            completed += 1;
            failedCount += 1;
            await this.prisma.mutualPromotionPostDelivery.update({
              where: { id: delivery.deliveryId },
              data: { status: 'FAILED', lastError: message },
            });
            onProgress?.(
              {
                ...this.progressItem(
                  delivery,
                  'FAILED',
                  false,
                  `Could not schedule “${delivery.postTitle}” for ${delivery.channelTitle}.`,
                ),
                error: message,
              },
              completed,
              total,
            );
          }
        }
      },
    );
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    if (schedulingErrors.length) {
      throw new BadRequestException(
        `${schedulingErrors.length} publication delivery(s) could not be added to Telegram Scheduled Messages: ${schedulingErrors[0]}`,
      );
    }
    return {
      folder: await this.read.detailForWorkspace(
        membership.workspaceId,
        folderId,
      ),
      deliveriesCreated,
      successCount,
      failedCount,
      telegramNativeCount,
      localSchedulerCount,
    };
  }

  private async preparedDeliveries(
    workspaceId: string,
    folderId: string,
  ): Promise<ActivationDelivery[]> {
    const rows = await this.prisma.mutualPromotionPostDelivery.findMany({
      where: { workspaceId, folderPost: { folderId } },
      orderBy: [
        { telegramChannelId: 'asc' },
        { folderPost: { position: 'asc' } },
      ],
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        telegramChannel: { select: { title: true } },
        managedPostId: true,
        managedPost: { select: { status: true, scheduleMode: true } },
        folderPost: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            buttonRows: true,
          },
        },
      },
    });
    return rows.flatMap((row) => {
      if (!row.managedPostId || !row.managedPost) return [];
      const mode = normalizeTelegramPostButtonRows(row.folderPost.buttonRows)
        .length
        ? ('LOCAL_SCHEDULER' as const)
        : ('TELEGRAM_NATIVE' as const);
      return [
        {
          deliveryId: row.id,
          folderPostId: row.folderPost.id,
          postTitle: row.folderPost.title,
          workspaceId: row.workspaceId,
          telegramChannelId: row.telegramChannelId,
          channelTitle: row.telegramChannel.title,
          managedPostId: row.managedPostId,
          scheduledAt: row.folderPost.scheduledAt,
          mode,
          alreadyScheduled:
            mode === 'TELEGRAM_NATIVE' &&
            (row.managedPost.status === 'SCHEDULED' ||
              row.managedPost.status === 'PUBLISHED') &&
            row.managedPost.scheduleMode === 'TELEGRAM_NATIVE',
        },
      ];
    });
  }

  private progressItem(
    delivery: ActivationDelivery,
    status: 'SCHEDULING' | 'SCHEDULED' | 'FAILED',
    success: boolean | null,
    message: string,
  ) {
    return {
      deliveryId: delivery.deliveryId,
      folderPostId: delivery.folderPostId,
      postTitle: delivery.postTitle,
      telegramChannelId: delivery.telegramChannelId,
      channelTitle: delivery.channelTitle,
      mode: delivery.mode,
      status,
      success,
      message,
    } as const;
  }

  private work(
    folder: { id: string; workspaceId: string },
    kind: MutualPromotionWorkKind,
    dueAt: Date,
    suffix: string,
    extra: { folderPostId?: string } = {},
  ) {
    return {
      workspaceId: folder.workspaceId,
      folderId: folder.id,
      kind,
      idempotencyKey: `mutual-promotion:${folder.id}:${suffix}`,
      dueAt,
      nextAttemptAt: dueAt,
      ...extra,
    };
  }
}

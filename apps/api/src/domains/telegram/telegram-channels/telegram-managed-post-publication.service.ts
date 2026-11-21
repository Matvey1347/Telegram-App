import { productionOperatorRequest } from '@api/telegram/shared/mtproto/production-recovery-relay-context';
import { managedPostDeliveryContext } from './telegram-managed-post-delivery-context';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import {
  PublishTelegramManagedPostDto,
  ScheduleTelegramManagedPostDto,
} from './dto';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';
import { TelegramManagedPostPublisherService } from './telegram-managed-post-publisher.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  managedPostNotFound,
  telegramPostsBadRequest,
} from './telegram-posts.errors';
import { requireNonBatchManagedPosts } from './telegram-managed-post-ownership';
import { nativeScheduleContentMatches } from './telegram-managed-post-rescheduler-repair';
import type { TelegramManagedPost } from '@prisma/client';
import { publicationScheduleTimeAtInstant } from './telegram-publication-schedule-times';

@Injectable()
export class TelegramManagedPostPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly botApiClient: TelegramBotApiClient,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramManagedPostPresentationService: TelegramManagedPostPresentationService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramManagedPostPublisherService: TelegramManagedPostPublisherService,
  ) {}

  async publishManagedPost(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduleAt?: Date,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
    actorUserId?: string,
    requireTelegramNativeSchedule = false,
    onRescheduleProgress?: (
      stage: 'REMOVING_OLD_SCHEDULE' | 'SCHEDULING_AGAIN',
      message?: string,
    ) => void,
  ) {
    await requireNonBatchManagedPosts(this.prisma, {
      workspaceId,
      channelId,
      postIds: [postId],
    });
    return this.publishManagedPostInternal(
      workspaceId,
      channelId,
      postId,
      scheduleAt,
      longTextMode,
      actorUserId,
      requireTelegramNativeSchedule,
      onRescheduleProgress,
    );
  }

  async publishBatchManagedPost(
    workspaceId: string,
    channelId: string,
    postId: string,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT',
  ) {
    return this.publishManagedPostInternal(
      workspaceId,
      channelId,
      postId,
      undefined,
      longTextMode,
    );
  }

  private async publishManagedPostInternal(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduleAt?: Date,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
    actorUserId?: string,
    requireTelegramNativeSchedule = false,
    onRescheduleProgress?: (
      stage: 'REMOVING_OLD_SCHEDULE' | 'SCHEDULING_AGAIN',
      message?: string,
    ) => void,
  ) {
    try {
      return await this.telegramManagedPostPublisherService.publishManagedPost(
        workspaceId,
        channelId,
        postId,
        scheduleAt,
        longTextMode,
        actorUserId,
        requireTelegramNativeSchedule,
        onRescheduleProgress,
      );
    } catch (error) {
      if (managedPostDeliveryContext.getStore()?.signal.aborted) throw error;
      const message =
        error instanceof Error ? error.message : 'Telegram publish failed';
      // Publisher preflight can fail before its delivery journal is entered.
      // Persist that failure for drafts/local deliveries so retries remain
      // observable instead of leaving a claimed post stuck in PUBLISHING.
      try {
        await this.prisma.telegramManagedPost.updateMany({
          where: {
            id: postId,
            workspaceId,
            telegramChannelId: channelId,
            OR: [
              { status: TelegramManagedPostStatus.DRAFT, deliveryClaimOwner: null },
              { status: TelegramManagedPostStatus.FAILED, deliveryClaimOwner: managedPostDeliveryContext.getStore()?.owner ?? null },
              { status: TelegramManagedPostStatus.PUBLISHING, deliveryClaimOwner: managedPostDeliveryContext.getStore()?.owner ?? null },
            ],
          },
          data: {
            status: TelegramManagedPostStatus.FAILED,
            lastError: message,
          },
        });
      } catch {
        // Failure observability is best effort and must never replace the
        // actionable Telegram/publisher error returned to the caller.
      }
      throw error;
    }
  }

  async scheduleManagedPostNatively(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduledAt: Date,
  ) {
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      scheduledAt,
      'IMAGES_THEN_TEXT',
      undefined,
      true,
    );
  }

  private readonly iconSelect = {
    id: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
  } as const;

  private readonly memberSummarySelect = {
    id: true,
    role: true,
    telegramUsername: true,
    avatarIconId: true,
    avatarIcon: { select: this.iconSelect },
    user: { select: { id: true, name: true } },
  } as const;

  private readonly managedPostInclude = {
    assignedMember: { select: this.memberSummarySelect },
    group: {
      select: {
        id: true,
        workspaceId: true,
        telegramChannelId: true,
        title: true,
        icon: true,
        isSystem: true,
        systemKey: true,
        statusNumberingEnabled: true,
        sidebarPosition: true,
      },
    },
  } as const;

  async publishManagedPostNow(
    userId: string,
    channelId: string,
    postId: string,
    dto: PublishTelegramManagedPostDto,
    onProgress?: (
      item: { stage: string; message?: string },
      current: number,
      total: number,
    ) => void,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    // An authenticated manual retry can reset a definite rejection. Accepted
    // and uncertain operations remain protected against duplicate publication.
    if (!productionOperatorRequest.getStore()) await this.prisma.telegramManagedPostSendOperation.deleteMany({
      where: {
        postId,
        workspaceId,
        channelId,
        status: { in: ['BLOCKED', 'REJECTED'] },
      },
    });
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      undefined,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
      userId,
      false,
      (stage, message) => onProgress?.({ stage, message }, 1, 1),
    );
  }

  async scheduleManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: ScheduleTelegramManagedPostDto,
    onProgress?: (
      item: { stage: string; message?: string },
      current: number,
      total: number,
    ) => void,
  ) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() <= Date.now())
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_SCHEDULE_IN_PAST',
        'Schedule date must be in the future',
      );
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);

    if (dto.publicationSlotId) {
      const assignedSlot =
        await this.prisma.telegramPublicationScheduleSlot.findFirst({
          where: {
            id: dto.publicationSlotId,
            isActive: true,
            schedule: {
              workspaceId,
              channelAssignments: {
                some: {
                  channelId,
                  OR: [
                    { selectionMode: 'FULL' },
                    {
                      selectionMode: 'SUBSET',
                      selectedSlots: {
                        some: { slotId: dto.publicationSlotId },
                      },
                    },
                  ],
                },
              },
            },
          },
          select: {
            id: true,
            time: true,
            schedule: {
              select: { workspace: { select: { timezone: true } } },
            },
          },
        });
      if (
        !assignedSlot ||
        !this.matchesPublicationSlot(
          scheduledAt,
          assignedSlot.time,
          assignedSlot.schedule.workspace.timezone || 'UTC',
        )
      ) {
        throw telegramPostsBadRequest(
          'TELEGRAM_PUBLICATION_SLOT_INVALID',
          'Publication slot is not assigned to this channel or does not match the scheduled time',
        );
      }
      const occupied = await this.prisma.telegramManagedPost.findFirst({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          id: { not: postId },
          scheduledAt,
          status: { in: ['SCHEDULED', 'PUBLISHING', 'PUBLISHED'] },
        },
        select: { id: true, title: true },
      });
      if (occupied) {
        throw telegramPostsBadRequest(
          'TELEGRAM_PUBLICATION_SLOT_OCCUPIED',
          `Publication slot is already used by "${occupied.title}"`,
        );
      }
    }
    await this.prisma.telegramManagedPost.updateMany({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      data: { publicationSlotId: dto.publicationSlotId ?? null },
    });
    await this.prisma.telegramManagedPostSendOperation.deleteMany({
      where: {
        postId,
        workspaceId,
        channelId,
        status: { in: ['BLOCKED', 'REJECTED'] },
      },
    });
    const result = await this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      scheduledAt,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
      userId,
      false,
      (stage, message) => onProgress?.({ stage, message }, 1, 1),
    );
    return result;
  }

  private matchesPublicationSlot(
    scheduledAt: Date,
    time: string,
    timezone: string,
  ) {
    return publicationScheduleTimeAtInstant(scheduledAt, timezone) === time;
  }

  public async cancelScheduledManagedPost(
    workspaceId: string,
    post: Pick<TelegramManagedPost, 'id' | 'telegramChannelId' | 'sourceType' | 'sourceId' |
      'telegramScheduledMessageIds' | 'scheduledAt' | 'text' | 'imageUrls' | 'mediaItems'> & {
      updatedAt?: Date;
      scheduleMode?: string | null;
      telegramRemoteStatus?: TelegramManagedPostRemoteStatus;
      telegramChannel: { username: string | null; telegramChatId: string | null };
    },
  ) {
    if (!post.telegramScheduledMessageIds.length) {
      if (post.scheduleMode === 'TELEGRAM_NATIVE' || post.telegramRemoteStatus === 'UNKNOWN')
        throw new Error('Native schedule has no verified Telegram IDs; reconcile before cancellation');
      return;
    }
    if (post.sourceType !== TelegramSourceType.MTPROTO || !post.sourceId) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_SCHEDULED',
        'Scheduled post has no MTProto source and cannot be cancelled safely',
      );
    }
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(
        post.telegramChannel,
      );
    if (!channelReference.telegramChatId && !channelReference.username)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TELEGRAM_REFERENCE_MISSING',
        'Scheduled post channel has no Telegram reference',
      );
    const scheduleAt = post.scheduledAt;
    if (!channelReference.telegramChatId || !scheduleAt)
      throw new Error('The original future Telegram schedule must be verified before cancellation.');
    const owner = `native-cancel:${randomUUID()}`;
    const acknowledgedOwner = owner.replace('native-cancel:', 'native-cancel-acked:');
    const where = {
      id: post.id, workspaceId, telegramChannelId: post.telegramChannelId,
    };
    const scheduledIdentity = {
      ...where, status: TelegramManagedPostStatus.SCHEDULED, scheduledAt: scheduleAt,
      sourceId: post.sourceId, sourceType: TelegramSourceType.MTPROTO,
      telegramScheduledMessageIds: { equals: post.telegramScheduledMessageIds },
    };
    const readAcknowledgement = async () => (
      await this.prisma.telegramManagedPost.findFirst({
        where: { ...scheduledIdentity, deliveryClaimOwner: { startsWith: 'native-cancel-acked:' } },
        select: { deliveryClaimOwner: true },
      })
    )?.deliveryClaimOwner;
    if (scheduleAt.getTime() <= Date.now()) {
      const previous = await readAcknowledgement();
      if (previous) return previous;
      throw new Error('The original future Telegram schedule must be verified before cancellation.');
    }
    const claim = await this.prisma.telegramManagedPost.updateMany({
      where: {
        ...scheduledIdentity,
        ...(post.updatedAt ? { updatedAt: post.updatedAt } : {}),
        deliveryClaimOwner: null,
        sendOperations: { none: {} },
        OR: [
          { nativeRecovery: { is: null } },
          { nativeRecovery: { is: {
            status: 'ACKED', scheduledAt: scheduleAt, sourceId: post.sourceId,
            newMessageIds: { equals: post.telegramScheduledMessageIds },
          } } },
        ],
      },
      data: { deliveryClaimOwner: owner, deliveryClaimExpiresAt: new Date('9999-12-31T00:00:00Z') },
    });
    if (claim.count !== 1) {
      const previous = await readAcknowledgement();
      if (previous) return previous;
      throw new Error('The Telegram cancellation is active or requires reconciliation.');
    }
    let started = false;
    try {
      const overlapping = await this.prisma.telegramManagedPost.findFirst({
        where: { workspaceId, telegramChannelId: post.telegramChannelId, id: { not: post.id },
          telegramScheduledMessageIds: { hasSome: post.telegramScheduledMessageIds } },
        select: { id: true },
      });
      if (overlapping) throw new Error('Telegram scheduled IDs are shared by multiple posts. Reconcile before cancellation.');
      const account = await this.telegramChannelAccessService.connectedAccount(
        workspaceId,
        post.telegramChannelId,
        post.sourceId,
      );
      const credentials = this.telegramChannelAccessService.accountCredentials(account);
      const queue = await this.mtprotoClient.getScheduledHistory({
        ...credentials, channel: channelReference, requireDeletionAccess: true,
      });
      const planned = Math.floor(scheduleAt.getTime() / 1000);
      if (!nativeScheduleContentMatches(post, queue) ||
          !post.telegramScheduledMessageIds.every((id) => {
            const date = queue.find((message) => message.id === id)?.date;
            return date && Math.floor(new Date(date).getTime() / 1000) === planned;
          })) {
        throw new Error('The original Telegram schedule could not be verified. Reconcile before cancellation.');
      }
      started = true;
      await this.mtprotoClient.deleteScheduledPost({
        ...credentials, channel: channelReference,
        messageIds: post.telegramScheduledMessageIds, scheduleAt,
      });
      const ack = await this.prisma.telegramManagedPost.updateMany({
        where: { ...scheduledIdentity, deliveryClaimOwner: owner },
        data: { deliveryClaimOwner: acknowledgedOwner },
      });
      if (ack.count !== 1) throw new Error('The Telegram cancellation requires reconciliation.');
      return acknowledgedOwner;
    } finally {
      // A missing acknowledgement permanently fences automatic cancellation retries.
      if (!started) {
        await this.prisma.telegramManagedPost.updateMany({
          where: { ...where, deliveryClaimOwner: owner },
          data: { deliveryClaimOwner: null, deliveryClaimExpiresAt: null },
        });
      }
    }
  }

  async returnManagedPostToDraft(
    userId: string,
    channelId: string,
    postId: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await requireNonBatchManagedPosts(this.prisma, {
      workspaceId,
      channelId,
      postIds: [postId],
    });
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      include: { telegramChannel: true },
    });
    if (!post) throw managedPostNotFound();
    if (post.status !== TelegramManagedPostStatus.SCHEDULED) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_SCHEDULED',
        'Only scheduled posts can be returned to draft',
      );
    }
    if (post.origin === 'TELEGRAM') {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_EDITABLE',
        'Posts created in Telegram cannot be returned to draft from the editor',
      );
    }
    const cancellation = await this.cancelScheduledManagedPost(workspaceId, post);
    const draftPost = await this.prisma.$transaction(async (tx) => {
      await this.telegramManagedPostRevisionStore.createManagedPostRevision(
        tx,
        post,
        'before_return_to_draft',
        userId,
      );
      const updated = await tx.telegramManagedPost.update({
        where: {
          id: postId, workspaceId, telegramChannelId: channelId, status: post.status,
          scheduledAt: post.scheduledAt, sourceId: post.sourceId,
          telegramScheduledMessageIds: { equals: post.telegramScheduledMessageIds },
          ...(cancellation ? {} : { updatedAt: post.updatedAt }),
          deliveryClaimOwner: cancellation ?? null,
        },
        data: {
          status: TelegramManagedPostStatus.DRAFT,
          deliveryClaimOwner: null,
          deliveryClaimExpiresAt: null,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          scheduledAt: null,
          scheduleMode: null,
          publicationSlotId: null,
          publishedAt: null,
          telegramScheduledMessageIds: [],
          telegramMessageIds: [],
          telegramMessageUrls: [],
          telegramIdVerificationStatus:
            TelegramManagedPostIdVerificationStatus.UNVERIFIED,
          telegramLinkSource: TelegramManagedPostLinkSource.AUTO,
          telegramIdVerifiedAt: null,
          telegramIdLastCheckedAt: null,
          sourceType: null,
          sourceId: null,
          publishMode: null,
          lastError: null,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote:
            'Scheduled Telegram post was cancelled and returned to draft from the editor.',
        },
        include: this.managedPostInclude,
      });
      if (post.groupId) {
        await this.telegramPostGroupsService.normalizePostGroupNumbering(
          tx,
          post.groupId,
        );
      }
      const canonical = await tx.telegramManagedPost.findUnique({
        where: { id: updated.id },
        include: this.managedPostInclude,
      });
      if (!canonical) throw managedPostNotFound();
      return canonical;
    });
    const [hydrated] =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        [draftPost],
      );
    return hydrated;
  }
}

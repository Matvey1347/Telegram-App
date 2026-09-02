import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
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
  ) {
    try {
      return await this.telegramManagedPostPublisherService.publishManagedPost(
        workspaceId,
        channelId,
        postId,
        scheduleAt,
        longTextMode,
      );
    } catch (error) {
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
              { status: TelegramManagedPostStatus.DRAFT },
              { status: TelegramManagedPostStatus.FAILED },
              { status: TelegramManagedPostStatus.PUBLISHING },
              {
                status: TelegramManagedPostStatus.SCHEDULED,
                scheduleMode: 'LOCAL',
              },
            ],
          },
          data: { status: TelegramManagedPostStatus.FAILED, lastError: message },
        });
      } catch {
        // Failure observability is best effort and must never replace the
        // actionable Telegram/publisher error returned to the caller.
      }
      throw error;
    }
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
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      undefined,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
    );
  }

  async scheduleManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: ScheduleTelegramManagedPostDto,
  ) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() <= Date.now())
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_SCHEDULE_IN_PAST',
        'Schedule date must be in the future',
      );
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      scheduledAt,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
    );
  }

  public async cancelScheduledManagedPost(
    workspaceId: string,
    post: {
      telegramChannelId: string;
      sourceType: TelegramSourceType | null;
      sourceId: string | null;
      telegramScheduledMessageIds: string[];
      telegramChannel: {
        username: string | null;
        telegramChatId: string | null;
      };
    },
  ) {
    if (!post.telegramScheduledMessageIds.length) return;
    if (post.sourceType !== TelegramSourceType.MTPROTO || !post.sourceId) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_SCHEDULED',
        'Scheduled post has no MTProto source and cannot be cancelled safely',
      );
    }
    const account = await this.telegramChannelAccessService.connectedAccount(
      workspaceId,
      post.telegramChannelId,
      post.sourceId,
    );
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(
        post.telegramChannel,
      );
    if (!channelReference.telegramChatId && !channelReference.username)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TELEGRAM_REFERENCE_MISSING',
        'Scheduled post channel has no Telegram reference',
      );
    await this.mtprotoClient.deleteScheduledPost({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: channelReference,
      messageIds: post.telegramScheduledMessageIds,
    });
  }

  async returnManagedPostToDraft(
    userId: string,
    channelId: string,
    postId: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
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
    await this.cancelScheduledManagedPost(workspaceId, post);
    const draftPost = await this.prisma.$transaction(async (tx) => {
      await this.telegramManagedPostRevisionStore.createManagedPostRevision(
        tx,
        post,
        'before_return_to_draft',
      );
      const updated = await tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          scheduledAt: null,
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

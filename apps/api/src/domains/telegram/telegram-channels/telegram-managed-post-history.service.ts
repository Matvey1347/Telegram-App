import { Injectable } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { UpdateTelegramManagedPostDto } from './dto';
import { stripLegacyGroupedPostTitlePrefix } from './post-groups.helpers';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  ManagedPostRevisionRecord,
  ManagedPostRevisionSource,
} from './telegram-channels.internal';
import { TelegramManagedPostEditTransportService } from './telegram-managed-post-edit-transport.service';
import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  managedPostNotFound,
  telegramPostsBadRequest,
  telegramPostsNotFound,
} from './telegram-posts.errors';

@Injectable()
export class TelegramManagedPostHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramManagedPostPresentationService: TelegramManagedPostPresentationService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramManagedPostEditTransportService: TelegramManagedPostEditTransportService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramManagedPostGroupPresentationService: TelegramManagedPostGroupPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly telegramManagedPostPublicationService: TelegramManagedPostPublicationService,
    private readonly telegramManagedPostMediaStorageService: TelegramManagedPostMediaStorageService,
  ) {}

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

  async managedPostHistory(userId: string, channelId: string, postId: string) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!post) throw managedPostNotFound();
    const revisions =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        await this.telegramManagedPostRevisionStore.listManagedPostRevisions(
          this.prisma,
          {
            telegramManagedPostId: postId,
            workspaceId,
          },
        ),
      );
    return revisions.map(({ actorMember, ...revision }) => ({
      ...revision,
      actorMember: actorMember
        ? this.telegramManagedPostGroupPresentationService.memberSummary(
            actorMember,
          )
        : null,
    }));
  }

  async restoreManagedPostRevision(
    userId: string,
    channelId: string,
    postId: string,
    revisionId: string,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    await this.telegramChannelCatalogService.findOne(userId, channelId);
    const [post, revision] = (await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
      }),
      this.telegramManagedPostRevisionStore.findManagedPostRevision(
        this.prisma,
        {
          id: revisionId,
          telegramManagedPostId: postId,
          workspaceId,
          telegramChannelId: channelId,
        },
      ),
    ])) as [ManagedPostRevisionSource | null, ManagedPostRevisionRecord | null];
    if (!post) throw managedPostNotFound();
    if (!revision)
      throw telegramPostsNotFound(
        'TELEGRAM_MANAGED_POST_NOT_FOUND',
        'Post revision not found',
      );
    return this.prisma.$transaction(async (tx) => {
      await this.telegramManagedPostRevisionStore.createManagedPostRevision(
        tx,
        post,
        'before_restore',
        userId,
      );
      const restored = await tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          title: revision.groupId
            ? stripLegacyGroupedPostTitlePrefix(
                revision.title,
                revision.groupPosition == null
                  ? null
                  : revision.groupPosition + 1,
              )
            : revision.title,
          text: revision.text,
          imageUrls: revision.imageUrls,
          buttonRows: normalizeTelegramPostButtonRows(revision.buttonRows),
          assignedMemberId: revision.assignedMemberId,
          icon: revision.icon,
          groupId: revision.groupId,
          groupPosition: revision.groupPosition,
          statusPosition: revision.groupId ? revision.statusPosition : null,
          sidebarPosition: revision.sidebarPosition,
          origin: revision.origin,
          remoteImportKey: revision.remoteImportKey,
          status: TelegramManagedPostStatus.DRAFT,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          scheduledAt: null,
          scheduleMode: null,
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
          lastTelegramSyncNote: `Restored from backup created at ${revision.createdAt.toISOString()}.`,
        },
        include: this.managedPostInclude,
      });
      const affectedGroupIds = [
        ...new Set(
          [post.groupId, revision.groupId].filter(Boolean) as string[],
        ),
      ];
      for (const affectedGroupId of affectedGroupIds) {
        await this.telegramPostGroupsService.normalizePostGroupNumbering(
          tx,
          affectedGroupId,
        );
      }
      const canonical = await tx.telegramManagedPost.findUnique({
        where: { id: restored.id },
        include: this.managedPostInclude,
      });
      if (!canonical) throw managedPostNotFound();
      return canonical;
    });
  }

  async updateManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: UpdateTelegramManagedPostDto,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!post) throw managedPostNotFound();
    if (dto.title !== undefined && !dto.title.trim())
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TITLE_REQUIRED',
        'Title is required',
      );
    if (dto.assignedMemberId === null)
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
        'Assigned member is required',
      );
    if (
      (post.status === TelegramManagedPostStatus.PUBLISHED ||
        post.status === TelegramManagedPostStatus.SCHEDULED) &&
      dto.imageUrls !== undefined &&
      !this.telegramManagedPostPresentationService.sameImageUrls(
        dto.imageUrls,
        post.imageUrls,
      )
    ) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_IMAGES_NOT_EDITABLE',
        'Images cannot be edited after the post is sent or scheduled. Update only the text.',
      );
    }
    if (
      post.origin === 'TELEGRAM' &&
      post.imageUrls.length > 0 &&
      dto.imageUrls !== undefined &&
      !this.telegramManagedPostPresentationService.sameImageUrls(
        dto.imageUrls,
        post.imageUrls,
      )
    ) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_MEDIA_NOT_REPLACEABLE',
        'Imported Telegram media cannot be replaced from the editor.',
      );
    }
    let assignedMemberId: string | undefined;
    if (
      dto.assignedMemberId !== undefined &&
      dto.assignedMemberId !== post.assignedMemberId
    ) {
      const resolved = await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
      if (!resolved.assignedMemberId) {
        throw telegramPostsBadRequest(
          'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
          'Assigned member is required',
        );
      }
      assignedMemberId = resolved.assignedMemberId;
    }
    const nextButtonRows =
      dto.buttonRows === undefined
        ? normalizeTelegramPostButtonRows(post.buttonRows)
        : normalizeTelegramPostButtonRows(dto.buttonRows);
    const nextImageUrls =
      dto.imageUrls === undefined
        ? undefined
        : await this.telegramManagedPostMediaStorageService.persistImageUrls(
            dto.imageUrls,
          );
    const convertsNativeScheduleToLocal =
      post.status === TelegramManagedPostStatus.SCHEDULED &&
      nextButtonRows.length > 0 &&
      post.scheduleMode !== 'LOCAL';
    if (dto.inPlaceOnly && convertsNativeScheduleToLocal) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_NOT_EDITABLE',
        'This scheduled Telegram post cannot add inline buttons without replacing the remote message.',
      );
    }
    let localBotSource:
      | Awaited<
          ReturnType<TelegramSourceAccessService['sourcesForChannel']>
        >[number]
      | undefined;
    if (convertsNativeScheduleToLocal) {
      localBotSource = (
        await this.sourceAccessService.sourcesForChannel(workspaceId, channelId)
      ).find(
        (source) =>
          source.sourceType === TelegramSourceType.BOT &&
          source.permissions.canPostMessages,
      );
      if (!localBotSource) {
        throw telegramPostsBadRequest(
          'TELEGRAM_POST_PUBLISH_SOURCE_UNAVAILABLE',
          'Publishing inline buttons requires a workspace bot with posting permission for this channel.',
        );
      }
      // The native copy must be gone before the managed post becomes local,
      // otherwise it would publish without buttons alongside the Bot delivery.
      await this.telegramManagedPostPublicationService.cancelScheduledManagedPost(
        workspaceId,
        {
          ...post,
          telegramChannel: await this.prisma.telegramChannel.findFirstOrThrow({
            where: { id: channelId, workspaceId },
            select: { username: true, telegramChatId: true },
          }),
        },
      );
    }
    const nextText = dto.text ?? post.text ?? '';
    const canEditRemoteTelegramText =
      (post.status === TelegramManagedPostStatus.PUBLISHED &&
        post.telegramRemoteStatus ===
          TelegramManagedPostRemoteStatus.PUBLISHED) ||
      (post.status === TelegramManagedPostStatus.SCHEDULED &&
        post.telegramScheduledMessageIds.length > 0);
    const channel =
      (dto.text !== undefined || dto.buttonRows !== undefined) &&
      canEditRemoteTelegramText
        ? await this.prisma.telegramChannel.findFirst({
            where: { id: channelId, workspaceId },
            select: {
              id: true,
              workspaceId: true,
              username: true,
              telegramChatId: true,
              inviteLink: true,
            },
          })
        : null;
    const telegramEdit =
      (dto.text !== undefined || dto.buttonRows !== undefined) &&
      canEditRemoteTelegramText &&
      channel
        ? await this.telegramManagedPostEditTransportService.editManagedPostTextInTelegram(
            {
              workspaceId,
              channelId,
              post,
              channel,
              nextText,
              buttonRows:
                dto.buttonRows === undefined ? post.buttonRows : dto.buttonRows,
              inPlaceOnly: dto.inPlaceOnly,
            },
          )
        : null;
    const updatedPost = await this.prisma.$transaction(async (tx) => {
      await this.telegramManagedPostRevisionStore.createManagedPostRevision(
        tx,
        post,
        'before_update',
        userId,
      );
      return tx.telegramManagedPost.update({
        where: { id: postId },
        data: {
          title: dto.title?.trim(),
          text: dto.text,
          imageUrls: nextImageUrls,
          buttonRows: dto.buttonRows === undefined ? undefined : nextButtonRows,
          scheduleMode: convertsNativeScheduleToLocal ? 'LOCAL' : undefined,
          telegramRemoteStatus: convertsNativeScheduleToLocal
            ? TelegramManagedPostRemoteStatus.NONE
            : undefined,
          sourceType: convertsNativeScheduleToLocal
            ? localBotSource?.sourceType
            : telegramEdit?.sourceType,
          sourceId: convertsNativeScheduleToLocal
            ? localBotSource?.sourceId
            : telegramEdit?.sourceId,
          lastTelegramSyncNote: convertsNativeScheduleToLocal
            ? 'Native scheduled copy cancelled; scheduled locally for Bot API delivery.'
            : telegramEdit?.lastTelegramSyncNote,
          assignedMemberId,
          icon: dto.icon === undefined ? undefined : dto.icon?.trim() || null,
          lastError: null,
          telegramScheduledMessageIds: convertsNativeScheduleToLocal
            ? []
            : telegramEdit && 'telegramScheduledMessageIds' in telegramEdit
              ? telegramEdit.telegramScheduledMessageIds
              : undefined,
          telegramMessageIds:
            telegramEdit && 'telegramMessageIds' in telegramEdit
              ? telegramEdit.telegramMessageIds
              : undefined,
          telegramMessageUrls:
            telegramEdit && 'telegramMessageUrls' in telegramEdit
              ? telegramEdit.telegramMessageUrls
              : undefined,
          publishMode: telegramEdit?.publishMode,
          lastTelegramSyncedAt: telegramEdit?.lastTelegramSyncedAt,
        },
        include: this.managedPostInclude,
      });
    });
    const [hydrated] =
      await this.telegramManagedPostGroupPresentationService.attachManagedPostIcons(
        [updatedPost],
      );
    return hydrated;
  }
}

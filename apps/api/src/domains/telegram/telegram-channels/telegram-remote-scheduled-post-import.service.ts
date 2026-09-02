import { Injectable, Logger } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  B2ObjectStorageService,
  isSupportedImmutableImageMimeType,
} from '../../../common/object-storage/b2-object-storage.service';
import { telegramHtmlToManagedMarkup } from '../../../telegram/shared/telegram-markup';
import {
  TelegramMtprotoClient,
  type TelegramScheduledMessage,
} from '../../../telegram/shared/telegram-mtproto.client';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import { telegramPostsBadRequest } from './telegram-posts.errors';

@Injectable()
export class TelegramRemoteScheduledPostImportService {
  private readonly logger = new Logger(
    TelegramRemoteScheduledPostImportService.name,
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostPresentationService: TelegramManagedPostPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
    private readonly objectStorage: B2ObjectStorageService,
  ) {}

  public async syncRemoteScheduledManagedPosts(params: {
    workspaceId: string;
    channelId: string;
    channel: Parameters<
      TelegramChannelAccessService['mtprotoChannelReference']
    >[0];
    assignedMemberId: string | null;
    account: Parameters<TelegramChannelAccessService['accountCredentials']>[0];
  }) {
    await this.telegramChannelSchemaCompatibilityService.ensurePostGroupSystemColumnsAvailable();
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(params.channel);
    if (!channelReference.telegramChatId && !channelReference.username) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_TELEGRAM_REFERENCE_MISSING',
        'Channel has no Telegram reference',
      );
    }

    const remoteScheduledHistory = await this.mtprotoClient.getScheduledHistory(
      {
        ...this.telegramChannelAccessService.accountCredentials(params.account),
        channel: channelReference,
      },
    );
    const groupedRemoteScheduled = this.groupRemoteScheduledMessages(
      remoteScheduledHistory,
    );

    this.applicationLogger.info({
      event: 'telegram.managed_posts.remote_scheduled.loaded',
      message: 'Loaded remote scheduled Telegram posts',
      workspaceId: params.workspaceId,
      metadata: {
        telegramChannelId: params.channelId,
        connectedAccountId:
          (params.account as { id?: string | null }).id ?? null,
        remoteScheduledCount: groupedRemoteScheduled.length,
      },
    });

    if (!groupedRemoteScheduled.length) {
      return {
        importedScheduled: 0,
        revivedScheduled: 0,
        remoteScheduledTotal: 0,
        remoteScheduledHistory,
      };
    }

    const fallbackAssignedMemberId =
      params.assignedMemberId ??
      (
        await this.prisma.workspaceMember.findFirst({
          where: { workspaceId: params.workspaceId },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      )?.id;
    if (!fallbackAssignedMemberId) {
      throw telegramPostsBadRequest(
        'TELEGRAM_POST_ASSIGNED_MEMBER_REQUIRED',
        'Assigned member is required to import Telegram posts',
      );
    }
    const importedSystemGroup =
      await this.telegramPostGroupsService.ensureTelegramImportedSystemGroup(
        params.workspaceId,
        params.channelId,
        fallbackAssignedMemberId,
      );
    let nextImportedGroupPosition = await this.prisma.telegramManagedPost.count(
      {
        where: { groupId: importedSystemGroup.id },
      },
    );

    const existingPosts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: params.workspaceId,
        telegramChannelId: params.channelId,
        OR: [
          { remoteImportKey: { not: null } },
          { status: TelegramManagedPostStatus.SCHEDULED },
        ],
      },
    });
    const existingImportedPostsByRemoteImportKey = new Map(
      existingPosts.flatMap((post) =>
        post.remoteImportKey ? [[post.remoteImportKey, post] as const] : [],
      ),
    );
    const existingScheduledMessageIds = new Set(
      existingPosts
        .filter(
          (post) =>
            post.status === TelegramManagedPostStatus.SCHEDULED &&
            post.telegramRemoteStatus ===
              TelegramManagedPostRemoteStatus.SCHEDULED,
        )
        .flatMap(
          (post) => post.telegramScheduledMessageIds ?? post.telegramMessageIds,
        ),
    );

    let importedScheduled = 0;
    let revivedScheduled = 0;
    let importedSystemGroupTouched = false;

    for (const item of groupedRemoteScheduled) {
      const canonicalText = item.html
        ? telegramHtmlToManagedMarkup(item.html)
        : item.text;
      const existingImported = existingImportedPostsByRemoteImportKey.get(
        item.remoteImportKey,
      );
      const existingImageUrls = existingImported
        ? await this.persistLegacyImportedImageUrls(existingImported.imageUrls)
        : [];
      const importedImageUrls = existingImageUrls.length
        ? existingImageUrls
        : item.hasMedia
          ? await this.importRemoteScheduledImageUrls(
              params.account,
              params.channel,
              item.messageIds,
            )
          : [];
      if (existingImported) {
        const nextScheduledAt = item.scheduledAt
          ? new Date(item.scheduledAt)
          : null;
        const nextTitle = this.importedManagedPostTitle(canonicalText);
        const nextText = canonicalText || null;
        const nextAssignedMemberId =
          existingImported.assignedMemberId ?? fallbackAssignedMemberId;
        const shouldAttachImportedGroup =
          existingImported.groupId !== importedSystemGroup.id ||
          existingImported.groupPosition == null;
        const shouldReviveImportedPost =
          existingImported.origin === 'TELEGRAM' &&
          (existingImported.status !== TelegramManagedPostStatus.SCHEDULED ||
            existingImported.telegramRemoteStatus !==
              TelegramManagedPostRemoteStatus.SCHEDULED ||
            existingImported.lastError !== null ||
            existingImported.title !== nextTitle ||
            (existingImported.text || null) !== nextText ||
            (existingImported.scheduledAt?.toISOString() ?? null) !==
              (nextScheduledAt?.toISOString() ?? null) ||
            !this.telegramManagedPostPresentationService.sameImageUrls(
              existingImported.imageUrls,
              importedImageUrls,
            ) ||
            existingImported.assignedMemberId !== nextAssignedMemberId ||
            (
              existingImported.telegramScheduledMessageIds ??
              existingImported.telegramMessageIds
            ).length !== item.messageIds.length ||
            (
              existingImported.telegramScheduledMessageIds ??
              existingImported.telegramMessageIds
            ).some((messageId, index) => messageId !== item.messageIds[index]));
        if (shouldReviveImportedPost) {
          const previousGroupId = existingImported.groupId;
          const revived = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.telegramManagedPost.update({
              where: { id: existingImported.id },
              data: {
                title: nextTitle,
                text: nextText,
                imageUrls: importedImageUrls,
                origin: 'TELEGRAM',
                remoteImportKey: item.remoteImportKey,
                status: TelegramManagedPostStatus.SCHEDULED,
                scheduledAt: nextScheduledAt,
                telegramScheduledMessageIds: item.messageIds,
                telegramMessageIds: [],
                telegramMessageUrls: [],
                telegramIdVerificationStatus:
                  TelegramManagedPostIdVerificationStatus.UNVERIFIED,
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
                sourceType: TelegramSourceType.MTPROTO,
                sourceId: (params.account as { id?: string | null }).id ?? null,
                assignedMemberId: nextAssignedMemberId,
                groupId: importedSystemGroup.id,
                groupPosition:
                  previousGroupId === importedSystemGroup.id
                    ? existingImported.groupPosition
                    : nextImportedGroupPosition,
                lastError: null,
                lastTelegramSyncedAt: new Date(),
                lastTelegramSyncNote: 'Synced from Telegram scheduled history.',
              },
            });
            if (previousGroupId && previousGroupId !== importedSystemGroup.id) {
              await this.telegramPostGroupsService.normalizePostGroupNumbering(
                tx,
                previousGroupId,
              );
            }
            return updated;
          });
          if (previousGroupId !== importedSystemGroup.id) {
            nextImportedGroupPosition += 1;
          }
          importedSystemGroupTouched = true;
          existingImportedPostsByRemoteImportKey.set(
            item.remoteImportKey,
            revived,
          );
          revivedScheduled += 1;
        } else if (shouldAttachImportedGroup) {
          const previousGroupId = existingImported.groupId;
          const repaired = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.telegramManagedPost.update({
              where: { id: existingImported.id },
              data: {
                groupId: importedSystemGroup.id,
                groupPosition: nextImportedGroupPosition,
              },
            });
            if (previousGroupId && previousGroupId !== importedSystemGroup.id) {
              await this.telegramPostGroupsService.normalizePostGroupNumbering(
                tx,
                previousGroupId,
              );
            }
            return updated;
          });
          existingImportedPostsByRemoteImportKey.set(
            item.remoteImportKey,
            repaired,
          );
          nextImportedGroupPosition += 1;
          importedSystemGroupTouched = true;
        }
        item.messageIds.forEach((messageId) =>
          existingScheduledMessageIds.add(messageId),
        );
        continue;
      }
      if (
        item.messageIds.some((messageId) =>
          existingScheduledMessageIds.has(messageId),
        )
      ) {
        continue;
      }
      const imported = await this.prisma.telegramManagedPost.create({
        data: {
          workspaceId: params.workspaceId,
          telegramChannelId: params.channelId,
          groupId: importedSystemGroup.id,
          groupPosition: nextImportedGroupPosition,
          title: this.importedManagedPostTitle(canonicalText),
          text: canonicalText || null,
          imageUrls: importedImageUrls,
          origin: 'TELEGRAM',
          remoteImportKey: item.remoteImportKey,
          status: TelegramManagedPostStatus.SCHEDULED,
          scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : null,
          telegramScheduledMessageIds: item.messageIds,
          telegramMessageIds: [],
          telegramMessageUrls: [],
          telegramIdVerificationStatus:
            TelegramManagedPostIdVerificationStatus.UNVERIFIED,
          telegramLinkSource: TelegramManagedPostLinkSource.AUTO,
          telegramIdVerifiedAt: null,
          telegramIdLastCheckedAt: null,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.SCHEDULED,
          sourceType: TelegramSourceType.MTPROTO,
          sourceId: (params.account as { id?: string | null }).id ?? null,
          assignedMemberId: fallbackAssignedMemberId,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote: 'Imported from Telegram scheduled history.',
        },
      });
      existingImportedPostsByRemoteImportKey.set(
        item.remoteImportKey,
        imported,
      );
      item.messageIds.forEach((messageId) =>
        existingScheduledMessageIds.add(messageId),
      );
      importedScheduled += 1;
      nextImportedGroupPosition += 1;
      importedSystemGroupTouched = true;
    }

    if (importedSystemGroupTouched) {
      await this.prisma.$transaction((tx) =>
        this.telegramPostGroupsService.normalizePostGroupNumbering(
          tx,
          importedSystemGroup.id,
        ),
      );
    }

    return {
      importedScheduled,
      revivedScheduled,
      remoteScheduledTotal: groupedRemoteScheduled.length,
      remoteScheduledHistory,
    };
  }

  public groupRemoteScheduledMessages(messages: TelegramScheduledMessage[]) {
    const groups = new Map<
      string,
      {
        remoteImportKey: string;
        scheduledAt: string | null;
        text: string;
        html: string;
        hasMedia: boolean;
        mediaKind: string | null;
        messageIds: string[];
      }
    >();
    for (const message of messages) {
      const key = message.groupedId
        ? `group:${message.groupedId}`
        : `message:${message.id}`;
      const current = groups.get(key);
      if (!current) {
        groups.set(key, {
          remoteImportKey: key,
          scheduledAt: message.date,
          text: message.text,
          html: message.html,
          hasMedia: message.hasMedia,
          mediaKind: message.mediaKind,
          messageIds: [message.id],
        });
        continue;
      }
      current.messageIds.push(message.id);
      current.hasMedia ||= message.hasMedia;
      current.mediaKind ||= message.mediaKind;
      if (!current.text && message.text) current.text = message.text;
      if (!current.html && message.html) current.html = message.html;
      if (!current.scheduledAt && message.date)
        current.scheduledAt = message.date;
    }
    return [...groups.values()].map((item) => ({
      ...item,
      messageIds: [...new Set(item.messageIds)].sort(
        (left, right) => Number(left) - Number(right),
      ),
    }));
  }

  public async importRemoteScheduledImageUrls(
    account: Parameters<TelegramChannelAccessService['accountCredentials']>[0],
    channel: {
      username: string | null;
      telegramChatId: string | null;
    },
    messageIds: string[],
  ) {
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username) {
      return [];
    }
    try {
      const media = await this.mtprotoClient.downloadChannelMessagesMedia({
        ...this.telegramChannelAccessService.accountCredentials(account),
        channel: channelReference,
        messageIds,
      });
      const imagesByMessageId = new Map(
        media
          .filter(
            (item) =>
              item.buffer.length > 0 &&
              isSupportedImmutableImageMimeType(item.mimeType),
          )
          .map((item) => [item.messageId, item] as const),
      );
      const ordered = messageIds.flatMap((messageId) => {
        const image = imagesByMessageId.get(messageId);
        return image ? [image] : [];
      });
      const stored = await this.objectStorage.persistImmutableImages(
        ordered.map((item) => ({
          bytes: item.buffer,
          mimeType: item.mimeType,
        })),
      );
      return stored.urls;
    } catch (error) {
      this.logger.warn(
        `Scheduled Telegram image persistence failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
    }
  }

  private async persistLegacyImportedImageUrls(imageUrls: string[]) {
    const legacy = imageUrls.flatMap((url, index) => {
      const match =
        /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(
          url,
        );
      if (!match) return [];
      const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
      return bytes.length
        ? [{ index, bytes, mimeType: match[1].toLowerCase() }]
        : [];
    });
    if (!legacy.length) {
      return imageUrls.filter((url) => /^https?:\/\//i.test(url));
    }
    try {
      const stored = await this.objectStorage.persistImmutableImages(legacy);
      const next = imageUrls.map((url) =>
        /^https?:\/\//i.test(url) ? url : '',
      );
      legacy.forEach((item, index) => {
        next[item.index] = stored.urls[index];
      });
      return next.filter(Boolean);
    } catch (error) {
      this.logger.warn(
        `Legacy scheduled Telegram image persistence failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return imageUrls;
    }
  }

  public importedManagedPostTitle(text: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Telegram scheduled post';
    return normalized.slice(0, 80);
  }
}

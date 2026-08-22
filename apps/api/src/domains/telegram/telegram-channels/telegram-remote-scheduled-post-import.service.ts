import { BadRequestException, Injectable } from '@nestjs/common';
import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostLinkSource,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
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

@Injectable()
export class TelegramRemoteScheduledPostImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostPresentationService: TelegramManagedPostPresentationService,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
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
      throw new BadRequestException('Channel has no Telegram reference');
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
      throw new BadRequestException(
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
      const importedImageUrls = item.hasMedia
        ? await this.importRemoteScheduledImageUrls(
            params.account,
            params.channel,
            item.messageIds,
          )
        : [];
      const existingImported = existingImportedPostsByRemoteImportKey.get(
        item.remoteImportKey,
      );
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
    const results = await Promise.all(
      messageIds.map(async (messageId) => {
        try {
          const media = await this.mtprotoClient.downloadChannelMessageMedia({
            ...this.telegramChannelAccessService.accountCredentials(account),
            channel: channelReference,
            messageId,
          });
          if (!media?.buffer?.length) return null;
          if (!String(media.mimeType || '').startsWith('image/')) return null;
          return `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
        } catch {
          return null;
        }
      }),
    );
    return results.filter((value): value is string => Boolean(value));
  }

  public importedManagedPostTitle(text: string) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'Telegram scheduled post';
    return normalized.slice(0, 80);
  }
}

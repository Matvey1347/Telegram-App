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
  TelegramUserAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { parseTelegramHtml } from '../../../telegram/shared/telegram-html-parser';
import {
  normalizeTelegramPostButtonRows,
  toTelegramBotInlineKeyboard,
} from '../../../telegram/shared/telegram-inline-keyboard';
import {
  requiresNativeTelegramRichMessage,
  telegramHtmlToMtprotoHtml,
  telegramMarkupToHtml,
} from '../../../telegram/shared/telegram-markup';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import {
  isRevokedTelegramSessionError,
  REVOKED_TELEGRAM_SESSION_MESSAGE,
} from '../../../telegram/shared/telegram-session-errors';
import { notifyScheduledTaskDueWorkChanged } from '../../operations/scheduled-tasks/scheduled-task-wake-notifier';
import { selectManagedPostPublishingSource } from './managed-post-publishing-source';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import {
  BotMessageEntity,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
} from './telegram-channels.internal';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';

@Injectable()
export class TelegramManagedPostPublisherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly botApiClient: TelegramBotApiClient,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramManagedPostPresentationService: TelegramManagedPostPresentationService,
    private readonly telegramManagedPostRevisionStore: TelegramManagedPostRevisionStore,
    private readonly telegramPostGroupsService: TelegramPostGroupsService,
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

  public async publishManagedPost(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduleAt?: Date,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
  ) {
    const [post, channel, initialSources] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
      }),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
      }),
      this.sourceAccessService.sourcesForChannel(workspaceId, channelId),
    ]);
    if (!post || !channel)
      throw new NotFoundException('Post or channel not found');
    let sources = initialSources;
    if (!post.text?.trim() && !post.imageUrls.length)
      throw new BadRequestException('Text or at least one image is required');
    await this.telegramManagedPostRevisionStore.createManagedPostRevision(
      this.prisma,
      post,
      scheduleAt ? 'before_schedule' : 'before_publish',
    );
    const buttonRows = normalizeTelegramPostButtonRows(post.buttonRows);
    const requiresRichMessage =
      !post.imageUrls.length &&
      requiresNativeTelegramRichMessage(post.text || '');
    let source = selectManagedPostPublishingSource(sources, {
      existingScheduledSourceId:
        scheduleAt && post.status === 'SCHEDULED' ? post.sourceId : null,
      requiresBotApi: Boolean(buttonRows.length) || requiresRichMessage,
    });
    if ((buttonRows.length || requiresRichMessage) && !source) {
      await this.telegramChannelAccessService.refreshSystemBotPublishingAccess(
        workspaceId,
        channel,
      );
      sources = await this.sourceAccessService.sourcesForChannel(
        workspaceId,
        channelId,
      );
      source = selectManagedPostPublishingSource(sources, {
        existingScheduledSourceId:
          scheduleAt && post.status === 'SCHEDULED' ? post.sourceId : null,
        requiresBotApi: true,
      });
    }
    if ((buttonRows.length || requiresRichMessage) && !source) {
      throw new BadRequestException(
        requiresRichMessage
          ? 'Native Telegram rich content (including pull quotes) requires an active workspace bot with posting permission for this channel.'
          : 'Publishing inline buttons requires an active workspace bot with posting permission for this channel.',
      );
    }
    if (!source) {
      throw new BadRequestException(
        'No connected source has posting permission',
      );
    }
    if (scheduleAt && source.sourceType !== TelegramSourceType.MTPROTO) {
      const scheduled = await this.prisma.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          status: TelegramManagedPostStatus.SCHEDULED,
          scheduleMode: 'LOCAL',
          scheduledAt: scheduleAt,
          publishedAt: null,
          telegramRemoteStatus: TelegramManagedPostRemoteStatus.NONE,
          telegramScheduledMessageIds: [],
          telegramMessageIds: [],
          telegramMessageUrls: [],
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          lastError: null,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote:
            'Scheduled locally for Bot API delivery; no Telegram scheduled message exists yet.',
        },
        include: this.managedPostInclude,
      });
      return this.notifyManagedPostSchedulePersisted(scheduled, scheduleAt);
    }
    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');
    let previousScheduledMessageCancelled = false;
    try {
      const resolvedText =
        await this.telegramManagedPostPresentationService.resolveInternalPostLinksForPublish(
          workspaceId,
          post.id,
          post.text || '',
          scheduleAt,
        );
      const [resolvedPlainText] = parseTelegramHtml(
        telegramMarkupToHtml(resolvedText),
      );
      if (
        source.sourceType === TelegramSourceType.MTPROTO &&
        post.imageUrls.length > 0 &&
        resolvedPlainText.length > TELEGRAM_CAPTION_LIMIT
      ) {
        const account =
          await this.telegramChannelAccessService.connectedAccount(
            workspaceId,
            channelId,
            source.sourceId,
          );
        if (
          this.telegramChannelAccessService.isCapabilityStale(
            account.premiumCheckedAt,
          )
        ) {
          const refreshedAccount =
            await this.telegramChannelAccessService.refreshMtprotoAccountCapabilities(
              account,
            );
          (
            source as {
              isPremium?: boolean;
              captionLengthMax?: number;
              messageLengthMax?: number;
              premiumCheckedAt?: Date | null;
            }
          ).isPremium = refreshedAccount.isPremium;
          (
            source as {
              captionLengthMax?: number;
              messageLengthMax?: number;
              premiumCheckedAt?: Date | null;
            }
          ).captionLengthMax = refreshedAccount.captionLengthMax;
          (
            source as {
              captionLengthMax?: number;
              messageLengthMax?: number;
              premiumCheckedAt?: Date | null;
            }
          ).messageLengthMax = refreshedAccount.messageLengthMax;
          (source as { premiumCheckedAt?: Date | null }).premiumCheckedAt =
            refreshedAccount.premiumCheckedAt;
        }
      }
      const renderLimits =
        source.sourceType === TelegramSourceType.MTPROTO
          ? {
              captionLengthMax:
                (source as { captionLengthMax?: number | null })
                  .captionLengthMax ?? TELEGRAM_CAPTION_LIMIT,
              messageLengthMax:
                (source as { messageLengthMax?: number | null })
                  .messageLengthMax ?? TELEGRAM_TEXT_MESSAGE_LIMIT,
            }
          : {
              captionLengthMax: TELEGRAM_CAPTION_LIMIT,
              messageLengthMax: TELEGRAM_TEXT_MESSAGE_LIMIT,
            };
      const {
        html,
        richHtml,
        captionHtml,
        followupHtmlParts,
        textHtmlParts,
        publishMode,
      } = this.telegramManagedPostPresentationService.renderManagedPostText(
        resolvedText,
        post.imageUrls,
        renderLimits,
        longTextMode,
      );
      let ids: string[];
      if (source.sourceType === TelegramSourceType.MTPROTO) {
        const account =
          await this.telegramChannelAccessService.connectedAccount(
            workspaceId,
            channelId,
            source.sourceId,
          );
        if (
          scheduleAt &&
          post.status === 'SCHEDULED' &&
          post.telegramScheduledMessageIds.length
        ) {
          await this.mtprotoClient.deleteScheduledPost({
            ...this.telegramChannelAccessService.accountCredentials(account),
            channel: channelReference,
            messageIds: post.telegramScheduledMessageIds,
          });
          previousScheduledMessageCancelled = true;
        }
        ids = await this.mtprotoClient.publishPost({
          ...this.telegramChannelAccessService.accountCredentials(account),
          channel: channelReference,
          html,
          textHtmlParts,
          captionHtml,
          followupHtmlParts,
          imageUrls: post.imageUrls,
          scheduleAt,
        });
      } else {
        const token = await this.telegramChannelAccessService.botTokenForSource(
          workspaceId,
          source.sourceId,
        );
        const chatId = this.telegramChannelAccessService.botChatId(channel);
        if (!chatId) {
          throw new BadRequestException('Channel has no Telegram chat id');
        }
        const call = <T>(method: string, body: Record<string, unknown>) =>
          this.botApiClient.call<T>(token, method, {
            chat_id: chatId,
            ...body,
          });
        const toBotFormattedText = (html: string) => {
          const [text, entities] = parseTelegramHtml(
            telegramHtmlToMtprotoHtml(html),
          );
          return {
            text,
            entities: entities
              .map((entity) =>
                this.telegramManagedPostPresentationService.toBotMessageEntity(
                  entity,
                ),
              )
              .filter((entity): entity is BotMessageEntity => Boolean(entity)),
          };
        };
        if (post.imageUrls.length > 1) {
          const caption = toBotFormattedText(captionHtml);
          const result = await call<Array<{ message_id: number }>>(
            'sendMediaGroup',
            {
              media: post.imageUrls.map((media, index) => ({
                type: 'photo',
                media,
                ...(index === 0 && captionHtml
                  ? {
                      caption: caption.text,
                      caption_entities: caption.entities,
                    }
                  : {}),
              })),
            },
          );
          ids = result.map((message) => String(message.message_id));
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            const textResult = await call<{ message_id: number }>(
              'sendMessage',
              {
                text: followup.text,
                entities: followup.entities,
              },
            );
            ids.push(String(textResult.message_id));
          }
        } else if (post.imageUrls.length === 1) {
          const caption = toBotFormattedText(captionHtml);
          const result = await call<{ message_id: number }>('sendPhoto', {
            photo: post.imageUrls[0],
            caption: caption.text,
            caption_entities: caption.entities,
          });
          ids = [String(result.message_id)];
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            const textResult = await call<{ message_id: number }>(
              'sendMessage',
              {
                text: followup.text,
                entities: followup.entities,
              },
            );
            ids.push(String(textResult.message_id));
          }
        } else {
          ids = [];
          if (richHtml && textHtmlParts.length === 1) {
            const result = await call<{ message_id: number }>(
              'sendRichMessage',
              {
                rich_message: { html: richHtml },
              },
            );
            ids.push(String(result.message_id));
          } else {
            for (const textHtml of textHtmlParts) {
              const message = toBotFormattedText(textHtml);
              const result = await call<{ message_id: number }>('sendMessage', {
                text: message.text,
                entities: message.entities,
              });
              ids.push(String(result.message_id));
            }
          }
        }
        if (buttonRows.length && ids.length) {
          await this.botApiClient.editMessageReplyMarkup(token, {
            chat_id: chatId,
            message_id: Number(ids.at(-1)),
            reply_markup: toTelegramBotInlineKeyboard(buttonRows),
          });
        }
      }
      const publishedUrls = scheduleAt
        ? []
        : this.telegramChannelAccessService.telegramMessageUrlsForPost(
            channel,
            ids,
            post.imageUrls.length,
          );
      const published = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: scheduleAt ? 'SCHEDULED' : 'PUBLISHED',
            telegramRemoteStatus: scheduleAt
              ? TelegramManagedPostRemoteStatus.SCHEDULED
              : TelegramManagedPostRemoteStatus.PUBLISHED,
            scheduledAt: scheduleAt ?? null,
            scheduleMode: scheduleAt ? 'TELEGRAM_NATIVE' : null,
            publishedAt: scheduleAt ? null : new Date(),
            telegramScheduledMessageIds: scheduleAt ? ids : [],
            telegramMessageIds: scheduleAt ? [] : ids,
            telegramMessageUrls: publishedUrls,
            telegramIdVerificationStatus: scheduleAt
              ? TelegramManagedPostIdVerificationStatus.UNVERIFIED
              : TelegramManagedPostIdVerificationStatus.VERIFIED,
            telegramLinkSource: TelegramManagedPostLinkSource.AUTO,
            telegramIdVerifiedAt: scheduleAt ? null : new Date(),
            telegramIdLastCheckedAt: scheduleAt ? null : new Date(),
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sourceWasPremium:
              source.sourceType === TelegramSourceType.MTPROTO
                ? Boolean((source as { isPremium?: boolean | null }).isPremium)
                : false,
            captionLengthMaxUsed: renderLimits.captionLengthMax,
            messageLengthMaxUsed: renderLimits.messageLengthMax,
            publishMode,
            lastError: null,
            lastTelegramSyncedAt: new Date(),
            lastTelegramSyncNote: null,
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
        if (!canonical) throw new NotFoundException('Managed post not found');
        return canonical;
      });
      return this.notifyManagedPostSchedulePersisted(published, scheduleAt);
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'Telegram publish failed';
      const publicMessage = /MEDIA_INVALID/i.test(rawMessage)
        ? 'Telegram rejected one of the images. Remove it, upload it again, and retry.'
        : isRevokedTelegramSessionError(error)
          ? REVOKED_TELEGRAM_SESSION_MESSAGE
          : rawMessage;
      await this.prisma.$transaction(async (tx) => {
        if (
          source.sourceType === TelegramSourceType.MTPROTO &&
          isRevokedTelegramSessionError(error)
        ) {
          await tx.telegramUserAccountIntegration.updateMany({
            where: {
              id: source.sourceId,
              workspaceId,
              status: TelegramUserAccountStatus.connected,
            },
            data: {
              status: TelegramUserAccountStatus.error,
              lastCheckedAt: new Date(),
              lastErrorMessage: REVOKED_TELEGRAM_SESSION_MESSAGE,
            },
          });
        }
        await tx.telegramManagedPost.update({
          where: { id: post.id },
          data: {
            status: 'FAILED',
            telegramRemoteStatus: previousScheduledMessageCancelled
              ? TelegramManagedPostRemoteStatus.MISSING
              : TelegramManagedPostRemoteStatus.UNKNOWN,
            lastError: publicMessage,
            telegramScheduledMessageIds: previousScheduledMessageCancelled
              ? []
              : undefined,
            sourceType: previousScheduledMessageCancelled ? null : undefined,
            sourceId: previousScheduledMessageCancelled ? null : undefined,
          },
        });
        if (post.groupId) {
          await this.telegramPostGroupsService.normalizePostGroupNumbering(
            tx,
            post.groupId,
          );
        }
      });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(publicMessage);
    }
  }

  public notifyManagedPostSchedulePersisted<T>(
    persisted: T,
    scheduleAt?: Date,
  ) {
    if (scheduleAt) {
      notifyScheduledTaskDueWorkChanged('telegram.managed_posts.reconcile_due');
    }
    return persisted;
  }
}

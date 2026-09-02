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
import {
  TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
  TelegramSourceAccessService,
} from '../../../telegram/shared/telegram-source-access.service';
import {
  isRevokedTelegramSessionError,
  REVOKED_TELEGRAM_SESSION_MESSAGE,
} from '../../../telegram/shared/telegram-session-errors';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  managedPostRequiresBotApi,
  selectManagedPostPublishingSource,
} from './managed-post-publishing-source';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import {
  BotMessageEntity,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
} from './telegram-channels.internal';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramManagedPostRevisionStore } from './telegram-managed-post-revision.store';
import { TelegramPostGroupsService } from './telegram-post-groups.service';
import {
  deliverTelegramManagedPostViaBot,
  type TelegramBotDeliveryOperation,
} from './telegram-managed-post-bot-delivery';

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

  public async publishManagedPost(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduleAt?: Date,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
  ) {
    const [foundPost, channel, initialSources] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
        include: { _count: { select: { adSalePlacements: true } } },
      }),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
      }),
      this.sourceAccessService.sourcesForChannel(workspaceId, channelId),
    ]);
    if (!foundPost || !channel)
      throw new NotFoundException('Post or channel not found');
    const { _count, ...postRecord } = foundPost;
    let post = postRecord;
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
    const requiresBotApi = managedPostRequiresBotApi({
      hasInlineButtons: Boolean(buttonRows.length),
      requiresRichMessage,
      isAdvertisingPost: (_count?.adSalePlacements ?? 0) > 0,
      existingSourceType: post.sourceType,
      hasExistingPublication: Boolean(
        post.publishedAt || post.telegramMessageIds.length,
      ),
    });
    const preferredBotSourceId =
      (_count?.adSalePlacements ?? 0) > 0
        ? TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID
        : undefined;
    let source = selectManagedPostPublishingSource(sources, {
      existingScheduledSourceId:
        scheduleAt && post.status === 'SCHEDULED' ? post.sourceId : null,
      requiresBotApi,
      preferredBotSourceId,
    });
    if (requiresBotApi && !source) {
      await (preferredBotSourceId
        ? this.telegramChannelAccessService.refreshProductionBotPublishingAccess(
            workspaceId,
            channel,
          )
        : this.telegramChannelAccessService.refreshSystemBotPublishingAccess(
            workspaceId,
            channel,
          ));
      sources = await this.sourceAccessService.sourcesForChannel(
        workspaceId,
        channelId,
      );
      source = selectManagedPostPublishingSource(sources, {
        existingScheduledSourceId:
          scheduleAt && post.status === 'SCHEDULED' ? post.sourceId : null,
        requiresBotApi: true,
        preferredBotSourceId,
      });
    }
    if (requiresBotApi && !source) {
      throw new BadRequestException(
        requiresRichMessage
          ? 'Native Telegram rich content (including pull quotes) requires an active workspace bot with posting permission for this channel.'
          : buttonRows.length
            ? 'Publishing inline buttons requires an active workspace bot with posting permission for this channel.'
            : 'Advertising posts require an active workspace bot with posting permission so inline buttons can be added later.',
      );
    }
    if (
      (post.status === TelegramManagedPostStatus.FAILED ||
        post.status === TelegramManagedPostStatus.PUBLISHING) &&
      post.telegramMessageIds.length
    ) {
      const journaledSource = sources.find(
        (candidate) =>
          candidate.sourceType === TelegramSourceType.BOT &&
          candidate.sourceId === post.sourceId &&
          candidate.permissions.canPostMessages,
      );
      if (!journaledSource) {
        throw new BadRequestException(
          'The bot that started this delivery is no longer available. Restore its channel access before retrying.',
        );
      }
      source = journaledSource;
    }
    if (!source) {
      throw new BadRequestException(
        'No connected source has posting permission',
      );
    }
    if (scheduleAt && source.sourceType !== TelegramSourceType.MTPROTO) {
      // Local delivery must be executable by this runtime. Otherwise a post
      // would look scheduled until the due worker discovers the missing bot.
      await this.telegramChannelAccessService.botTokenForSource(
        workspaceId,
        source.sourceId,
      );
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
      const storedImageUrls =
        await this.telegramManagedPostMediaStorageService.persistImageUrls(
          post.imageUrls,
        );
      if (storedImageUrls.some((url, index) => url !== post.imageUrls[index])) {
        post = await this.prisma.telegramManagedPost.update({
          where: { id: post.id },
          data: { imageUrls: storedImageUrls },
        });
      }
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
        const operations: TelegramBotDeliveryOperation[] = [];
        if (post.imageUrls.length > 1) {
          const caption = toBotFormattedText(captionHtml);
          operations.push({
            method: 'sendMediaGroup',
            body: {
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
            expectedMessageCount: post.imageUrls.length,
            messageIds: (result) =>
              (result as Array<{ message_id: number }>).map((message) =>
                String(message.message_id),
              ),
          });
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            operations.push({
              method: 'sendMessage',
              body: {
                text: followup.text,
                entities: followup.entities,
              },
              expectedMessageCount: 1,
              messageIds: (result) => [
                String((result as { message_id: number }).message_id),
              ],
            });
          }
        } else if (post.imageUrls.length === 1) {
          const caption = toBotFormattedText(captionHtml);
          operations.push({
            method: 'sendPhoto',
            body: {
              photo: post.imageUrls[0],
              caption: caption.text,
              caption_entities: caption.entities,
            },
            expectedMessageCount: 1,
            messageIds: (result) => [
              String((result as { message_id: number }).message_id),
            ],
          });
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            operations.push({
              method: 'sendMessage',
              body: {
                text: followup.text,
                entities: followup.entities,
              },
              expectedMessageCount: 1,
              messageIds: (result) => [
                String((result as { message_id: number }).message_id),
              ],
            });
          }
        } else {
          if (richHtml && textHtmlParts.length === 1) {
            operations.push({
              method: 'sendRichMessage',
              body: {
                rich_message: { html: richHtml },
              },
              expectedMessageCount: 1,
              messageIds: (result) => [
                String((result as { message_id: number }).message_id),
              ],
            });
          } else {
            for (const textHtml of textHtmlParts) {
              const message = toBotFormattedText(textHtml);
              operations.push({
                method: 'sendMessage',
                body: { text: message.text, entities: message.entities },
                expectedMessageCount: 1,
                messageIds: (result) => [
                  String((result as { message_id: number }).message_id),
                ],
              });
            }
          }
        }
        const journaledMessageIds =
          post.status === TelegramManagedPostStatus.FAILED ||
          post.status === TelegramManagedPostStatus.PUBLISHING
            ? post.telegramMessageIds
            : [];
        ids = await deliverTelegramManagedPostViaBot({
          operations,
          journaledMessageIds,
          call,
          persist: async (messageIds) => {
            await this.prisma.telegramManagedPost.update({
              where: { id: post.id },
              data: {
                telegramMessageIds: messageIds,
                telegramRemoteStatus: TelegramManagedPostRemoteStatus.UNKNOWN,
                sourceType: source.sourceType,
                sourceId: source.sourceId,
              },
            });
          },
          ...(buttonRows.length
            ? {
                applyReplyMarkup: async (lastMessageId: string) => {
                  await this.botApiClient.editMessageReplyMarkup(token, {
                    chat_id: chatId,
                    message_id: Number(lastMessageId),
                    reply_markup: toTelegramBotInlineKeyboard(buttonRows),
                  });
                },
              }
            : {}),
        });
      }
      if (!ids.length) {
        throw new BadRequestException(
          scheduleAt
            ? 'Telegram did not confirm the scheduled post. Nothing was added to Telegram Scheduled Messages.'
            : 'Telegram did not confirm the published post.',
        );
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
      return this.notifyManagedPostSchedulePersisted(
        published,
        scheduleAt,
        (_count?.adSalePlacements ?? 0) > 0,
      );
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
    hasAdSalePlacement = false,
  ) {
    if (scheduleAt) {
      notifyScheduledTaskDueWorkChanged('telegram.managed_posts.reconcile_due');
    } else if (hasAdSalePlacement) {
      notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
    }
    return persisted;
  }
}

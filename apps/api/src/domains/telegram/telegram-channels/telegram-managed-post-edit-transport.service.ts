import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { parseTelegramHtml } from '../../../telegram/shared/telegram-html-parser';
import {
  normalizeTelegramPostButtonRows,
  toTelegramBotInlineKeyboard,
} from '../../../telegram/shared/telegram-inline-keyboard';
import { telegramHtmlToMtprotoHtml } from '../../../telegram/shared/telegram-markup';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { parseTelegramPostUrl } from '../../../telegram/shared/telegram-post-url';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  BotMessageEntity,
  TELEGRAM_CAPTION_LIMIT,
  TELEGRAM_TEXT_MESSAGE_LIMIT,
} from './telegram-channels.internal';
import { TelegramManagedPostPresentationService } from './telegram-managed-post-presentation.service';

@Injectable()
export class TelegramManagedPostEditTransportService {
  constructor(
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly botApiClient: TelegramBotApiClient,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramManagedPostPresentationService: TelegramManagedPostPresentationService,
  ) {}

  public async editManagedPostTextInTelegram(params: {
    workspaceId: string;
    channelId: string;
    post: {
      id: string;
      status: TelegramManagedPostStatus;
      text: string | null;
      imageUrls: string[];
      publishMode: string | null;
      sourceId: string | null;
      sourceType: TelegramSourceType | null;
      scheduledAt: Date | null;
      telegramScheduledMessageIds: string[];
      telegramMessageIds: string[];
      telegramMessageUrls: string[];
      buttonRows?: Prisma.JsonValue | null;
    };
    channel: {
      id: string;
      workspaceId: string;
      username: string | null;
      telegramChatId: string | null;
      inviteLink?: string | null;
      telegramAccessHash?: string | null;
    };
    nextText: string;
    buttonRows: unknown;
  }) {
    const { workspaceId, channelId, post, channel, nextText } = params;
    const buttonRows = normalizeTelegramPostButtonRows(params.buttonRows);
    if (
      post.status !== TelegramManagedPostStatus.PUBLISHED &&
      post.status !== TelegramManagedPostStatus.SCHEDULED
    ) {
      return null;
    }

    const storedMessageIds =
      post.status === TelegramManagedPostStatus.SCHEDULED
        ? post.telegramScheduledMessageIds
        : post.telegramMessageIds;
    const effectiveMessageIds = storedMessageIds.length
      ? [...storedMessageIds]
      : [
          ...new Set(
            post.telegramMessageUrls.flatMap((url) => {
              const parsed = parseTelegramPostUrl(url);
              return parsed ? [parsed.messageId] : [];
            }),
          ),
        ];
    if (!effectiveMessageIds.length) {
      throw new BadRequestException(
        'This Telegram post cannot be updated because no Telegram message link is attached yet.',
      );
    }

    let sources = await this.sourceAccessService.sourcesForChannel(
      workspaceId,
      channelId,
    );
    const source =
      (post.sourceId && post.sourceType
        ? sources.find(
            (item) =>
              item.sourceId === post.sourceId &&
              item.sourceType === post.sourceType &&
              item.permissions.canEditMessages,
          )
        : undefined) ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.MTPROTO &&
          item.permissions.canEditMessages,
      ) ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.BOT &&
          item.permissions.canEditMessages,
      );
    if (!source) {
      throw new BadRequestException(
        'No connected Telegram source has permission to edit this post.',
      );
    }

    const channelReference =
      this.telegramChannelAccessService.mtprotoChannelReference(channel);
    if (!channelReference.telegramChatId && !channelReference.username)
      throw new BadRequestException('Channel has no Telegram reference');

    const resolvedText =
      await this.telegramManagedPostPresentationService.resolveInternalPostLinksForPublish(
        workspaceId,
        post.id,
        nextText,
        post.status === TelegramManagedPostStatus.SCHEDULED
          ? post.scheduledAt || undefined
          : undefined,
      );
    const rendered =
      this.telegramManagedPostPresentationService.renderManagedPostText(
        resolvedText,
        post.imageUrls,
        {
          captionLengthMax:
            (post as { captionLengthMaxUsed?: number | null })
              .captionLengthMaxUsed ?? TELEGRAM_CAPTION_LIMIT,
          messageLengthMax:
            (post as { messageLengthMaxUsed?: number | null })
              .messageLengthMaxUsed ?? TELEGRAM_TEXT_MESSAGE_LIMIT,
        },
        post.publishMode === 'CAPTION_THEN_TEXT'
          ? 'CAPTION_THEN_TEXT'
          : 'IMAGES_THEN_TEXT',
      );
    const expectedMessageCount = post.imageUrls.length
      ? post.imageUrls.length + rendered.followupHtmlParts.length
      : rendered.textHtmlParts.length;

    if (source.sourceType === TelegramSourceType.MTPROTO) {
      if (rendered.richHtml) {
        let botSource = sources.find(
          (item) =>
            item.sourceType === TelegramSourceType.BOT &&
            item.permissions.canPostMessages,
        );
        if (!botSource) {
          await this.telegramChannelAccessService.refreshSystemBotPublishingAccess(
            workspaceId,
            channel,
          );
          sources = await this.sourceAccessService.sourcesForChannel(
            workspaceId,
            channelId,
          );
          botSource = sources.find(
            (item) =>
              item.sourceType === TelegramSourceType.BOT &&
              item.permissions.canPostMessages,
          );
        }
        if (!botSource) {
          throw new BadRequestException(
            'Native Telegram rich content (including pull quotes) requires an active workspace bot with posting permission for this channel.',
          );
        }
        if (post.status !== TelegramManagedPostStatus.PUBLISHED) {
          throw new BadRequestException(
            'A scheduled MTProto post must be cancelled before it can be converted to a native Telegram rich message.',
          );
        }
        const account =
          await this.telegramChannelAccessService.connectedAccount(
            workspaceId,
            channelId,
            source.sourceId,
          );
        const token = await this.telegramChannelAccessService.botTokenForSource(
          workspaceId,
          botSource.sourceId,
        );
        const chatId = this.telegramChannelAccessService.botChatId(channel);
        if (!chatId) {
          throw new BadRequestException('Channel has no Telegram chat id');
        }
        const published = await this.botApiClient.call<{
          message_id: number;
        }>(token, 'sendRichMessage', {
          chat_id: chatId,
          rich_message: { html: rendered.richHtml },
          ...(buttonRows.length
            ? { reply_markup: toTelegramBotInlineKeyboard(buttonRows) }
            : {}),
        });
        const replacementMessageId = String(published.message_id);
        try {
          await this.mtprotoClient.deletePublishedMessages({
            ...this.telegramChannelAccessService.accountCredentials(account),
            channel: channelReference,
            messageIds: effectiveMessageIds,
          });
        } catch (error) {
          await this.botApiClient
            .deleteMessage(token, {
              chat_id: chatId,
              message_id: published.message_id,
            })
            .catch(() => undefined);
          throw error;
        }
        return {
          sourceId: botSource.sourceId,
          sourceType: botSource.sourceType,
          telegramMessageIds: [replacementMessageId],
          telegramMessageUrls:
            this.telegramChannelAccessService.telegramMessageUrlsForPost(
              channel,
              [replacementMessageId],
            ),
          publishMode: rendered.publishMode,
          lastTelegramSyncedAt: new Date(),
          lastTelegramSyncNote:
            'Replaced the legacy MTProto message with a native Telegram rich message.',
        };
      }
      if (expectedMessageCount !== effectiveMessageIds.length) {
        throw new BadRequestException(
          'Text update would change the number of Telegram messages. Keep the same message count or republish the post.',
        );
      }
      if (buttonRows.length)
        throw new BadRequestException(
          'Inline buttons require a Bot API published post and cannot be added through an MTProto source.',
        );
      const account = await this.telegramChannelAccessService.connectedAccount(
        workspaceId,
        channelId,
        source.sourceId,
      );
      const editResult = await this.mtprotoClient.editPostText({
        ...this.telegramChannelAccessService.accountCredentials(account),
        channel: channelReference,
        messageIds: effectiveMessageIds,
        imageCount: post.imageUrls.length,
        publishMode: rendered.publishMode,
        captionHtml: rendered.captionHtml,
        followupHtmlParts: rendered.followupHtmlParts,
        textHtmlParts: rendered.textHtmlParts,
      });
      return {
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        ...(post.status === TelegramManagedPostStatus.SCHEDULED
          ? { telegramScheduledMessageIds: effectiveMessageIds }
          : { telegramMessageIds: effectiveMessageIds }),
        publishMode: rendered.publishMode,
        lastTelegramSyncedAt: new Date(),
        lastTelegramSyncNote:
          this.telegramChannelsSupportService.telegramTextEditNote(editResult),
      };
    }

    if (expectedMessageCount !== effectiveMessageIds.length) {
      throw new BadRequestException(
        'Text update would change the number of Telegram messages. Keep the same message count or republish the post.',
      );
    }
    const token = await this.telegramChannelAccessService.botTokenForSource(
      workspaceId,
      source.sourceId,
    );
    const chatId = this.telegramChannelAccessService.botChatId(channel);
    if (!chatId) {
      throw new BadRequestException('Channel has no Telegram chat id');
    }
    let updatedCount = 0;
    let unchangedCount = 0;
    const call = async (method: string, body: Record<string, unknown>) => {
      try {
        await this.botApiClient.call(token, method, {
          chat_id: chatId,
          ...body,
        });
      } catch (error) {
        const description = error instanceof Error ? error.message : '';
        if (
          this.telegramChannelsSupportService.isBotMessageNotModified(
            description,
          )
        ) {
          unchangedCount += 1;
          return false;
        }
        throw error;
      }
      updatedCount += 1;
      return true;
    };
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
    if (post.imageUrls.length) {
      const caption = toBotFormattedText(rendered.captionHtml);
      await call('editMessageCaption', {
        message_id: Number(effectiveMessageIds[0]),
        caption: caption.text,
        caption_entities: caption.entities,
      });
      for (
        let index = 0;
        index < rendered.followupHtmlParts.length;
        index += 1
      ) {
        const message = toBotFormattedText(rendered.followupHtmlParts[index]);
        await call('editMessageText', {
          message_id: Number(
            effectiveMessageIds[post.imageUrls.length + index],
          ),
          text: message.text,
          entities: message.entities,
        });
      }
    } else {
      if (rendered.richHtml && rendered.textHtmlParts.length === 1) {
        await call('editMessageText', {
          message_id: Number(effectiveMessageIds[0]),
          rich_message: { html: rendered.richHtml },
        });
      } else {
        for (let index = 0; index < rendered.textHtmlParts.length; index += 1) {
          const message = toBotFormattedText(rendered.textHtmlParts[index]);
          await call('editMessageText', {
            message_id: Number(effectiveMessageIds[index]),
            text: message.text,
            entities: message.entities,
          });
        }
      }
    }
    await this.botApiClient.editMessageReplyMarkup(token, {
      chat_id: chatId,
      message_id: Number(effectiveMessageIds.at(-1)),
      reply_markup: toTelegramBotInlineKeyboard(buttonRows),
    });

    return {
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      ...(post.status === TelegramManagedPostStatus.SCHEDULED
        ? { telegramScheduledMessageIds: effectiveMessageIds }
        : { telegramMessageIds: effectiveMessageIds }),
      publishMode: rendered.publishMode,
      lastTelegramSyncedAt: new Date(),
      lastTelegramSyncNote:
        this.telegramChannelsSupportService.telegramTextEditNote({
          updatedCount,
          unchangedCount,
        }),
    };
  }
}

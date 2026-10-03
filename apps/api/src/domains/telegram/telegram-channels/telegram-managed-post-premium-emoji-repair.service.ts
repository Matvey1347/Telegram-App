import { BadRequestException, Injectable } from '@nestjs/common';
import { TelegramSourceType } from '@prisma/client';
import { parseTelegramCustomEmojiTokens } from '../../../telegram/shared/telegram-custom-emoji-markup';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';

@Injectable()
export class TelegramManagedPostPremiumEmojiRepairService {
  constructor(
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
  ) {}

  /**
   * Bot API delivery can silently turn custom emoji entities into their Unicode
   * fallback. Keep the Bot-owned message (and thus its inline keyboard), then
   * have a Premium channel editor restore its caption/text entities in place.
   */
  async restoreCustomEmojiAfterBotDelivery(params: {
    text: string | null;
    workspaceId: string;
    channelId: string;
    channel: {
      username: string | null;
      telegramChatId: string | null;
      inviteLink?: string | null;
      telegramAccessHash?: string | null;
    };
    sources: Array<{
      sourceId: string;
      sourceType: TelegramSourceType;
      isPremium?: boolean;
      mtprotoPublishingEnabled?: boolean | null;
      permissions: { canEditMessages: boolean };
    }>;
    messageIds: string[];
    imageCount: number;
    publishMode: string;
    captionHtml: string;
    followupHtmlParts: string[];
    textHtmlParts: string[];
  }) {
    if (!parseTelegramCustomEmojiTokens(params.text || '').length) return;

    const premiumEditor = params.sources.find(
      (source) =>
        source.sourceType === TelegramSourceType.MTPROTO &&
        source.isPremium &&
        source.mtprotoPublishingEnabled !== false &&
        source.permissions.canEditMessages,
    );
    if (!premiumEditor) {
      throw new BadRequestException(
        'A connected Premium Telegram account with permission to edit channel messages is required to preserve premium emoji in a bot-published post.',
      );
    }

    const account = await this.telegramChannelAccessService.connectedAccount(
      params.workspaceId,
      params.channelId,
      premiumEditor.sourceId,
    );
    const result = await this.mtprotoClient.editPostText({
      ...this.telegramChannelAccessService.accountCredentials(account),
      channel: this.telegramChannelAccessService.mtprotoChannelReference(
        params.channel,
      ),
      messageIds: params.messageIds,
      imageCount: params.imageCount,
      publishMode: params.publishMode,
      captionHtml: params.captionHtml,
      followupHtmlParts: params.followupHtmlParts,
      textHtmlParts: params.textHtmlParts,
    });
    if (result.updatedCount + result.unchangedCount !== params.messageIds.length) {
      throw new Error('Telegram did not confirm every premium emoji repair.');
    }
  }
}

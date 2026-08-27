import { Injectable } from '@nestjs/common';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotIconCaptureService } from '../../../../telegram/shared/telegram-bot-icon-capture.service';
import {
  FinanceChatFlowService,
  type FinanceFlowInput,
  type FinanceFlowResult,
} from '../../consumer-finance/chat-flows/finance-chat-flow.service';
import type { TelegramBotWebhookUpdate } from '../core/telegram-bot-update.types';

export type FinanceBotIconInputResult =
  | { handled: false }
  | { handled: true; result: FinanceFlowResult }
  | { handled: true; error: true };

export function financeBotFlowInput(
  profileId: string,
  botIntegrationId: string,
  telegramBotUserId: string,
): FinanceFlowInput {
  return { profileId, botIntegrationId, telegramBotUserId };
}

export function financeBotIncomingFile(
  message: TelegramBotWebhookUpdate['message'],
) {
  if (message?.document?.file_id)
    return {
      id: message.document.file_id,
      size: message.document.file_size,
      mime: message.document.mime_type,
    };
  const photo = message?.photo?.at(-1);
  return photo?.file_id
    ? { id: photo.file_id, size: photo.file_size, mime: 'image/jpeg' }
    : null;
}

@Injectable()
export class FinanceBotIconInputService {
  constructor(
    private readonly flows: FinanceChatFlowService,
    private readonly icons: TelegramBotIconCaptureService,
    private readonly botApi: TelegramBotApiClient,
  ) {}

  async consume(
    token: string,
    chatId: string,
    input: FinanceFlowInput,
    message: NonNullable<TelegramBotWebhookUpdate['message']>,
  ): Promise<FinanceBotIconInputResult> {
    const hasMedia = Boolean(
      message.photo?.length ||
      (message.document?.file_id &&
        message.document.mime_type?.startsWith('image/')),
    );
    if (!hasMedia || !(await this.flows.expectsIcon(input)))
      return { handled: false };
    try {
      const iconSource = await this.icons.media(token, message);
      const result = iconSource
        ? await this.flows.consumeIcon({ ...input, iconSource })
        : null;
      if (!result) return { handled: true, error: true };
      if (message.message_id)
        await this.botApi
          .deleteMessage(token, {
            chat_id: chatId,
            message_id: message.message_id,
          })
          .catch(() => undefined);
      return { handled: true, result };
    } catch {
      return { handled: true, error: true };
    }
  }

  text(message: NonNullable<TelegramBotWebhookUpdate['message']>) {
    return this.icons.text(message);
  }
}

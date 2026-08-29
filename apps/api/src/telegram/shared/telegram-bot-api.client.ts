import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

export type TelegramBotApiErrorKind = 'TRANSIENT' | 'PERMANENT' | 'BLOCKED';

export class TelegramBotApiError extends Error {
  constructor(
    message: string,
    readonly kind: TelegramBotApiErrorKind,
  ) {
    super(message);
  }
}

type TelegramApiResponse<TResult> = {
  ok?: boolean;
  description?: string;
  result?: TResult;
};

export type TelegramBotCommand = {
  command: string;
  description: string;
};

export type TelegramBotCommandScope =
  | { type: 'default' }
  | { type: 'all_private_chats' };

export type TelegramChatMenuButton =
  | { type: 'default' }
  | { type: 'commands' }
  | { type: 'web_app'; text: string; webAppUrl: string };

export type TelegramChatMenuButtonInfo =
  | { type: 'commands' }
  | { type: 'web_app'; text?: string; webAppUrl?: string }
  | { type: string; [key: string]: unknown };

@Injectable()
export class TelegramBotApiClient {
  async getMe(token: string) {
    return this.call<{
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    }>(token, 'getMe', {}, 'GET');
  }

  async getMyName(token: string) {
    return this.call<{ name?: string }>(token, 'getMyName', {}, 'GET');
  }

  async setMyName(token: string, name: string) {
    return this.call<boolean>(token, 'setMyName', { name });
  }

  async getUserProfilePhotos(token: string, userId: string) {
    return this.call<{
      total_count?: number;
      photos?: Array<
        Array<{ file_id: string; width?: number; height?: number }>
      >;
    }>(
      token,
      'getUserProfilePhotos',
      { user_id: userId, offset: 0, limit: 1 },
      'GET',
    );
  }

  async setMyProfilePhoto(token: string, jpeg: Buffer) {
    const form = new FormData();
    form.append(
      'photo',
      JSON.stringify({ type: 'static', photo: 'attach://profile_photo' }),
    );
    form.append(
      'profile_photo',
      new Blob([Uint8Array.from(jpeg)], { type: 'image/jpeg' }),
      'profile-photo.jpg',
    );
    return this.callForm<boolean>(token, 'setMyProfilePhoto', form);
  }

  async getChatMember(token: string, chatId: string, userId: string) {
    return this.call<Record<string, unknown>>(token, 'getChatMember', {
      chat_id: chatId,
      user_id: userId,
    });
  }

  async setWebhook(token: string, url: string, secretToken: string) {
    return this.call<boolean>(token, 'setWebhook', {
      url,
      secret_token: secretToken,
      drop_pending_updates: false,
    });
  }

  async deleteWebhook(token: string) {
    return this.call<boolean>(token, 'deleteWebhook', {
      drop_pending_updates: false,
    });
  }

  async setMyCommands(
    token: string,
    commands: TelegramBotCommand[],
    languageCode?: string,
    scope?: TelegramBotCommandScope,
  ) {
    return this.call<boolean>(token, 'setMyCommands', {
      commands,
      ...(languageCode ? { language_code: languageCode } : {}),
      ...(scope ? { scope } : {}),
    });
  }

  async deleteMyCommands(token: string, languageCode?: string) {
    return this.call<boolean>(token, 'deleteMyCommands', {
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  async setChatMenuButton(
    token: string,
    menuButton: TelegramChatMenuButton = { type: 'commands' },
    chatId?: string,
  ) {
    return this.call<boolean>(token, 'setChatMenuButton', {
      ...(chatId ? { chat_id: chatId } : {}),
      menu_button:
        menuButton.type === 'web_app'
          ? {
              type: 'web_app',
              text: menuButton.text,
              web_app: { url: menuButton.webAppUrl },
            }
          : menuButton,
    });
  }

  async getWebhookInfo(token: string) {
    return this.call<Record<string, unknown>>(
      token,
      'getWebhookInfo',
      {},
      'GET',
    );
  }

  async getChatMenuButton(token: string, chatId?: string) {
    const result = await this.call<Record<string, unknown>>(
      token,
      'getChatMenuButton',
      chatId ? { chat_id: chatId } : {},
      'GET',
    );
    const webApp = result.web_app;
    return {
      type: typeof result.type === 'string' ? result.type : 'commands',
      text: typeof result.text === 'string' ? result.text : undefined,
      webAppUrl:
        webApp &&
        typeof webApp === 'object' &&
        typeof (webApp as { url?: unknown }).url === 'string'
          ? (webApp as { url: string }).url
          : undefined,
    } as TelegramChatMenuButtonInfo;
  }

  async getUpdates<TUpdate>(
    token: string,
    payload: {
      offset?: number;
      timeout?: number;
      allowed_updates?: string[];
    },
  ) {
    return this.call<TUpdate[]>(token, 'getUpdates', payload);
  }

  async sendMessage(
    token: string,
    payload: {
      chat_id: string;
      text: string;
      parse_mode?: string;
      reply_markup?: unknown;
      link_preview_options?: unknown;
    },
  ) {
    return this.call<{ message_id: number }>(token, 'sendMessage', payload);
  }

  /** Bot API Rich Messages are deliberately isolated from the MTProto sender. */
  async sendRichMessage(
    token: string,
    payload: { chat_id: string; rich_message: unknown; reply_markup?: unknown },
  ) {
    return this.call<{ message_id: number }>(token, 'sendRichMessage', payload);
  }

  async sendChatAction(token: string, chatId: string, action = 'typing') {
    return this.call<boolean>(token, 'sendChatAction', {
      chat_id: chatId,
      action,
    });
  }

  async sendPhoto(
    token: string,
    payload: {
      chat_id: string;
      photo: string;
      caption?: string;
      parse_mode?: string;
      reply_markup?: unknown;
      link_preview_options?: unknown;
    },
  ) {
    return this.call<{ message_id: number }>(token, 'sendPhoto', payload);
  }

  async sendMediaGroup(
    token: string,
    payload: { chat_id: string; media: unknown[] },
  ) {
    return this.call<Array<{ message_id: number }>>(
      token,
      'sendMediaGroup',
      payload,
    );
  }

  async editMessageText(
    token: string,
    payload: {
      chat_id: string;
      message_id: number;
      text: string;
      parse_mode?: string;
      reply_markup?: unknown;
    },
  ) {
    return this.call<unknown>(token, 'editMessageText', payload);
  }

  async editRichMessage(
    token: string,
    payload: {
      chat_id: string;
      message_id: number;
      rich_message: unknown;
      reply_markup?: unknown;
    },
  ) {
    return this.call<unknown>(token, 'editMessageText', payload);
  }

  async editMessageCaption(
    token: string,
    payload: {
      chat_id: string;
      message_id: number;
      caption?: string;
      parse_mode?: string;
      reply_markup?: unknown;
    },
  ) {
    return this.call<unknown>(token, 'editMessageCaption', payload);
  }

  async editMessageReplyMarkup(
    token: string,
    payload: { chat_id: string; message_id: number; reply_markup?: unknown },
  ) {
    return this.call<unknown>(token, 'editMessageReplyMarkup', payload);
  }

  async answerCallbackQuery(
    token: string,
    payload: { callback_query_id: string; text?: string },
  ) {
    return this.call<boolean>(token, 'answerCallbackQuery', payload);
  }

  async approveChatJoinRequest(
    token: string,
    payload: { chat_id: string; user_id: string },
  ) {
    return this.call<boolean>(token, 'approveChatJoinRequest', payload);
  }

  async declineChatJoinRequest(
    token: string,
    payload: { chat_id: string; user_id: string },
  ) {
    return this.call<boolean>(token, 'declineChatJoinRequest', payload);
  }

  async deleteMessage(
    token: string,
    payload: { chat_id: string; message_id: number },
  ) {
    return this.call<boolean>(token, 'deleteMessage', payload);
  }

  async getFile(token: string, fileId: string) {
    return this.call<{
      file_id: string;
      file_size?: number;
      file_path?: string;
    }>(token, 'getFile', { file_id: fileId });
  }

  async downloadFile(token: string, filePath: string, maxBytes: number) {
    const response = await fetch(
      `https://api.telegram.org/file/bot${token}/${filePath}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!response.ok)
      throw new BadGatewayException('Telegram file download failed');
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > maxBytes)
      throw new BadRequestException('Telegram file exceeds the allowed size');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes)
      throw new BadRequestException('Telegram file exceeds the allowed size');
    return {
      bytes,
      contentType:
        response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  async createInvoiceLink(
    token: string,
    payload: {
      title: string;
      description: string;
      payload: string;
      currency: 'XTR';
      prices: Array<{ label: string; amount: number }>;
      subscription_period: 2592000;
    },
  ) {
    return this.call<string>(token, 'createInvoiceLink', {
      ...payload,
      provider_token: '',
    });
  }

  async answerPreCheckoutQuery(
    token: string,
    payload: {
      pre_checkout_query_id: string;
      ok: boolean;
      error_message?: string;
    },
  ) {
    return this.call<boolean>(token, 'answerPreCheckoutQuery', payload);
  }

  async editUserStarSubscription(
    token: string,
    payload: {
      user_id: string;
      telegram_payment_charge_id: string;
      is_canceled: boolean;
    },
  ) {
    return this.call<boolean>(token, 'editUserStarSubscription', payload);
  }

  async call<TResult>(
    token: string,
    method: string,
    body: Record<string, unknown>,
    httpMethod: 'GET' | 'POST' = 'POST',
  ): Promise<TResult> {
    const url = new URL(`https://api.telegram.org/bot${token}/${method}`);
    const init: RequestInit =
      httpMethod === 'GET'
        ? { signal: AbortSignal.timeout(15_000) }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
          };
    if (httpMethod === 'GET') {
      for (const [key, value] of Object.entries(body)) {
        url.searchParams.set(key, String(value));
      }
    }
    const response = await fetch(url, init);
    const payload = (await response.json()) as TelegramApiResponse<TResult>;
    if (!response.ok || !payload.ok) {
      throw this.toError(payload.description, response.status);
    }
    return payload.result as TResult;
  }

  private async callForm<TResult>(
    token: string,
    method: string,
    body: FormData,
  ) {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(20_000),
      },
    );
    const payload = (await response.json()) as TelegramApiResponse<TResult>;
    if (!response.ok || !payload.ok) {
      throw this.toError(payload.description, response.status);
    }
    return payload.result as TResult;
  }

  private toError(
    description = 'Telegram Bot API request failed',
    status: number,
  ) {
    const lower = description.toLowerCase();
    if (
      lower.includes('bot was blocked') ||
      lower.includes('forbidden') ||
      lower.includes('chat not found') ||
      lower.includes('user is deactivated')
    ) {
      return new TelegramBotApiError(description, 'BLOCKED');
    }
    if (status >= 500 || lower.includes('too many requests')) {
      return new TelegramBotApiError(description, 'TRANSIENT');
    }
    if (lower.includes('invalid') || lower.includes('unauthorized')) {
      return new BadRequestException(description);
    }
    if (status >= 500) return new BadGatewayException(description);
    return new TelegramBotApiError(description, 'PERMANENT');
  }
}

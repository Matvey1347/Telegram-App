import { TelegramSystemBotConfigService } from '@api/domains/telegram/telegram-system-bot/telegram-system-bot-config.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '../bot/telegram-bot-api.client';

export class AvatarEmojiApiError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
    readonly explicitRejected = false,
    readonly errorCode?: number,
  ) {
    super(message);
    this.name = 'AvatarEmojiApiError';
  }
}

export type AvatarEmojiSticker = {
  fileId: string;
  fileUniqueId: string;
  customEmojiId: string;
};

type Sticker = {
  file_id: string;
  file_unique_id: string;
  custom_emoji_id: string;
};

/** Telegram-only adapter. Persistence, pack capacity and retries belong to the caller. */
@Injectable()
export class ChannelAvatarEmojiApi {
  constructor(
    private readonly config: ConfigService,
    private readonly botApi: TelegramBotApiClient,
    private readonly systemBot: TelegramSystemBotConfigService,
  ) {}

  private credentials() {
    const token = this.systemBot.token;
    const username = this.systemBot.username?.replace(/^@/, '').toLowerCase();
    const environment = this.systemBot.environment;
    const oppositeToken =
      environment === 'LOCAL'
        ? this.systemBot.productionToken
        : this.systemBot.localToken;
    const owner = this.config
      .get<string>('TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID')
      ?.trim();
    const ownerId = Number(owner);
    if (
      !token ||
      !environment ||
      (oppositeToken && oppositeToken === token) ||
      !username ||
      !/^[a-z][a-z0-9_]{4,31}$/.test(username) ||
      !owner ||
      !/^\d+$/.test(owner) ||
      !Number.isSafeInteger(ownerId) ||
      ownerId <= 0
    ) {
      return null;
    }
    return { token, username, ownerId, environment };
  }

  configured() {
    return this.credentials() !== null;
  }

  private requireCredentials() {
    const credentials = this.credentials();
    if (!credentials) {
      throw new AvatarEmojiApiError(
        'Channel avatar emoji service is not configured.',
      );
    }
    return credentials;
  }

  packName(sequence: number) {
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new AvatarEmojiApiError(
        'Invalid channel avatar emoji pack sequence.',
      );
    }
    return `channelavatars${sequence.toString(36)}_by_${this.requireCredentials().username}`;
  }

  packSuffix() {
    return `_by_${this.requireCredentials().username}`;
  }

  ownsPack(shortName: string) {
    return shortName.toLowerCase().endsWith(this.packSuffix());
  }

  /** Keep historical documents intact while each System Bot gets its own image version. */
  assetKey(hash: string) {
    const { environment, username } = this.requireCredentials();
    return `${environment.toLowerCase()}:${username}:${hash}`;
  }

  private identityKey: string | null = null;
  private async verifiedCredentials() {
    const credentials = this.requireCredentials();
    const key = `${credentials.environment}:${credentials.token}:${credentials.username}`;
    if (key !== this.identityKey) {
      try {
        const me = await this.botApi.getMe(credentials.token);
        if (me.username?.toLowerCase() !== credentials.username)
          throw new AvatarEmojiApiError(
            'System Bot username does not match the selected environment token.',
            undefined,
            true,
            400,
          );
        this.identityKey = key;
      } catch (error) {
        throw this.failure(error, 'identity check');
      }
    }
    return credentials;
  }

  private failure(error: unknown, operation: string) {
    if (error instanceof AvatarEmojiApiError) return error;
    const telegram = error instanceof TelegramBotApiError ? error : null;
    // Never propagate transport error messages/causes: fetch errors can contain the token URL.
    return new AvatarEmojiApiError(
      `Telegram avatar emoji ${operation} failed. Retry the operation.`,
      telegram?.retryAfterSeconds,
      telegram?.explicitRejected,
      telegram?.errorCode,
    );
  }

  async upload(png: Buffer): Promise<{ fileId: string; fileUniqueId: string }> {
    const { token, ownerId } = await this.verifiedCredentials();
    const form = new FormData();
    form.append('user_id', String(ownerId));
    form.append('sticker_format', 'static');
    form.append(
      'sticker',
      new Blob([Uint8Array.from(png)], { type: 'image/png' }),
      'avatar.png',
    );
    try {
      // The shared client's multipart helper is private; JSON operations below reuse its public call.
      const response = await fetch(
        `https://api.telegram.org/bot${token}/uploadStickerFile`,
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(20_000),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        error_code?: number;
        parameters?: { retry_after?: number };
        result?: { file_id?: string; file_unique_id?: string };
      };
      if (!response.ok || !payload.ok) {
        const retry = payload.parameters?.retry_after;
        throw new AvatarEmojiApiError(
          'Telegram avatar emoji upload failed. Retry the operation.',
          typeof retry === 'number' && Number.isFinite(retry) && retry >= 0
            ? retry
            : undefined,
          payload.ok === false && Number.isInteger(payload.error_code),
          Number.isInteger(payload.error_code) ? payload.error_code : undefined,
        );
      }
      if (!payload.result?.file_id || !payload.result.file_unique_id) {
        throw new AvatarEmojiApiError(
          'Telegram returned an invalid avatar emoji file.',
        );
      }
      return {
        fileId: payload.result.file_id,
        fileUniqueId: payload.result.file_unique_id,
      };
    } catch (error) {
      throw this.failure(error, 'upload');
    }
  }

  async getPack(name: string): Promise<AvatarEmojiSticker[]> {
    const { token } = await this.verifiedCredentials();
    try {
      const pack = await this.botApi.call<{
        sticker_type: string;
        stickers: Sticker[];
      }>(token, 'getStickerSet', { name });
      if (
        pack.sticker_type !== 'custom_emoji' ||
        !Array.isArray(pack.stickers)
      ) {
        throw new AvatarEmojiApiError(
          'Telegram avatar emoji pack has an unexpected type.',
        );
      }
      return pack.stickers.map((sticker) => {
        if (
          !sticker.file_id ||
          !sticker.file_unique_id ||
          !/^\d+$/.test(sticker.custom_emoji_id ?? '')
        ) {
          throw new AvatarEmojiApiError(
            'Telegram returned an invalid avatar emoji sticker.',
          );
        }
        return {
          fileId: sticker.file_id,
          fileUniqueId: sticker.file_unique_id,
          customEmojiId: sticker.custom_emoji_id,
        };
      });
    } catch (error) {
      if (
        error instanceof TelegramBotApiError &&
        error.explicitRejected &&
        error.errorCode === 400 &&
        /\bSTICKERSET_INVALID\b/i.test(error.message)
      )
        return [];
      throw this.failure(error, 'pack lookup');
    }
  }

  async downloadSticker(fileId: string): Promise<Buffer> {
    const { token } = await this.verifiedCredentials();
    try {
      const file = await this.botApi.getFile(token, fileId);
      if (!file.file_path)
        throw new AvatarEmojiApiError(
          'Telegram avatar document has no downloadable file.',
        );
      return (await this.botApi.downloadFile(token, file.file_path, 256_000))
        .bytes;
    } catch (error) {
      throw this.failure(error, 'document verification');
    }
  }

  private inputSticker(fileId: string) {
    return { sticker: fileId, format: 'static', emoji_list: ['📣'] };
  }

  async createPack(name: string, fileId: string): Promise<void> {
    if (!this.ownsPack(name))
      throw new AvatarEmojiApiError(
        'This pack belongs to another bot.',
        undefined,
        true,
        400,
      );
    const { token, ownerId } = await this.verifiedCredentials();
    try {
      await this.botApi.call<boolean>(token, 'createNewStickerSet', {
        user_id: ownerId,
        name,
        title: 'Channel avatars',
        stickers: [this.inputSticker(fileId)],
        sticker_type: 'custom_emoji',
        needs_repainting: false,
      });
    } catch (error) {
      throw this.failure(error, 'pack creation');
    }
  }

  async addToPack(name: string, fileId: string): Promise<void> {
    if (!this.ownsPack(name))
      throw new AvatarEmojiApiError(
        'This pack belongs to another bot.',
        undefined,
        true,
        400,
      );
    const { token, ownerId } = await this.verifiedCredentials();
    try {
      await this.botApi.call<boolean>(token, 'addStickerToSet', {
        user_id: ownerId,
        name,
        sticker: this.inputSticker(fileId),
      });
    } catch (error) {
      throw this.failure(error, 'pack addition');
    }
  }
}

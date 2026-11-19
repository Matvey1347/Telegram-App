import { Injectable } from '@nestjs/common';
import { TelegramMtprotoClient } from '../mtproto/telegram-mtproto.client';

@Injectable()
export class ChannelAvatarPhotoService {
  constructor(private readonly mtproto: TelegramMtprotoClient) {}

  async download(
    credentials: { apiId: string; apiHash: string; session: string },
    channel: {
      username: string | null;
      telegramChatId: string | null;
      telegramAccessHash: string | null;
      inviteLink: string | null;
    },
  ) {
    const signal = AbortSignal.timeout(60_000);
    const client = await this.mtproto.createClient(credentials, signal);
    const abort = () => {
      void this.mtproto.closeClient(client);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      const resolved = await this.mtproto.withTimeout(
        this.mtproto.resolveStoredChannel(client, channel),
        45_000,
        'Avatar channel lookup',
      );
      const photo = await this.mtproto.withTimeout(
        client.downloadProfilePhoto(resolved.entity, { isBig: true }),
        15_000,
        'Avatar download',
      );
      // No guessed public URL: Telegram's missing-photo result is authoritative.
      return Buffer.isBuffer(photo) && photo.length ? photo : null;
    } finally {
      signal.removeEventListener('abort', abort);
      await this.mtproto.closeClient(client);
    }
  }
}

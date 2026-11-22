import { telegramPublicPhotoUrl } from './telegram-mtproto-account-profile';
import { withTelegramReadDeadline } from './telegram-publication-deadline';
import { Api, TelegramClient } from 'telegram';
import type { TelegramAccountCapabilities } from '@telegram-system/shared';
import { loginWithTelegramQr } from '@api/telegram/shared/mtproto/telegram-qr-login.adapter';
import type { TelegramQrLoginProgress } from '@telegram-system/shared';
import {
  signInTelegramWithCode,
  signInTelegramWithPassword,
  startTelegramPhoneLogin,
} from '@api/telegram/shared/mtproto/telegram-phone-login.adapter';
import type { TelegramAccountProfile } from '@api/telegram/shared/mtproto/telegram-mtproto-account-profile';
import { type TelegramMtprotoSessionCredentials } from '@api/telegram/shared/mtproto/telegram-mtproto-session.factory';
import { runBounded } from '@api/common/run-bounded';
import {
  DEFAULT_MT_PROTO_CAPTION_LIMIT,
  PREMIUM_MT_PROTO_CAPTION_LIMIT,
  DEFAULT_TELEGRAM_MESSAGE_LIMIT,
} from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  closeClient: TelegramMtprotoClient['closeClient'];
  createClient: TelegramMtprotoClient['createClient'];
  profilePhotoDataUrl: TelegramMtprotoClient['profilePhotoDataUrl'];
  telegramMetadataTimeoutMs: TelegramMtprotoClient['telegramMetadataTimeoutMs'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toJsonSafe: TelegramMtprotoClient['toJsonSafe'];
  getAccountProfileFromClient: TelegramMtprotoClient['getAccountProfileFromClient'];
};

export class TelegramMtprotoAccounts {
  constructor(private readonly context: Dependencies) {}

  private readonly defaultTelegramPaletteSize = 7;

  private extractNameColor(user: Api.User) {
    const rawCandidates = [
      (user as any)?.color?.color,
      (user as any)?.color?.colorId,
      (user as any)?.profileColor?.color,
      (user as any)?.profileColor?.colorId,
      (user as any)?.color,
      (user as any)?.profileColor,
    ];
    for (const raw of rawCandidates) {
      const numeric = this.context.toFiniteNumber(raw);
      if (numeric != null) return numeric;
    }

    // Telegram may omit explicit color fields for some accounts/sessions.
    // Fallback to a deterministic Telegram-like default bucket from user id.
    const userIdNum = this.context.toFiniteNumber((user as any)?.id);
    if (userIdNum != null) {
      return Math.abs(userIdNum) % this.defaultTelegramPaletteSize;
    }
    return 0;
  }

  private normalizeTelegramLimit(value: unknown, fallback: number) {
    const numeric = this.context.toFiniteNumber(value);
    if (
      numeric == null ||
      !Number.isInteger(numeric) ||
      numeric < 1 ||
      numeric > 100_000
    ) {
      return fallback;
    }
    return numeric;
  }

  private toMegabytes(value: unknown) {
    const numeric = this.context.toFiniteNumber(value);
    if (numeric == null || numeric <= 0) return null;
    return Math.max(1, Math.round(numeric / (1024 * 1024)));
  }

  async getAccountProfileFromClient(
    client: TelegramClient,
    fallbackUser?: Api.User | null,
  ): Promise<TelegramAccountProfile> {
    const meRaw = fallbackUser ?? (await client.getMe());
    const me = (await this.getSelfUserWithDetails(client, meRaw)) || meRaw;
    const isPremium = Boolean(me.premium);
    const fallbackCaptionLengthMax = isPremium
      ? PREMIUM_MT_PROTO_CAPTION_LIMIT
      : DEFAULT_MT_PROTO_CAPTION_LIMIT;
    const checkedAt = new Date().toISOString();
    let config: Awaited<ReturnType<TelegramClient['invoke']>> | null = null;
    let limitsSource: TelegramAccountCapabilities['limitsSource'] =
      'telegram_config';

    try {
      config = await client.invoke(new Api.help.GetConfig());
    } catch {
      limitsSource = 'fallback';
    }

    const captionLengthMax = this.normalizeTelegramLimit(
      (config as { captionLengthMax?: unknown } | null)?.captionLengthMax,
      fallbackCaptionLengthMax,
    );
    const messageLengthMax = this.normalizeTelegramLimit(
      (config as { messageLengthMax?: unknown } | null)?.messageLengthMax,
      DEFAULT_TELEGRAM_MESSAGE_LIMIT,
    );
    const maxUploadFileSizeMb =
      this.toMegabytes(
        (config as { uploadMaxFilepartsPremium?: unknown } | null)
          ?.uploadMaxFilepartsPremium,
      ) ??
      this.toMegabytes(
        (config as { uploadMaxFilepartsDefault?: unknown } | null)
          ?.uploadMaxFilepartsDefault,
      ) ??
      0;

    const username = me.username || null;
    const photoUrl =
      (await this.context.profilePhotoDataUrl(client, me)) ||
      telegramPublicPhotoUrl(username);

    return {
      id: String(me.id),
      username,
      firstName: me.firstName || null,
      lastName: me.lastName || null,
      photoUrl,
      nameColor: this.extractNameColor(me),
      capabilities: {
        isPremium,
        captionLengthMax,
        messageLengthMax,
        maxUploadFileSizeMb,
        supportsCustomEmoji: isPremium,
        checkedAt,
        limitsSource,
      },
    };
  }

  private saveSession(client: TelegramClient): string {
    const saved = client.session.save();
    return typeof saved === 'string' ? saved : '';
  }

  private loginAdapterDependencies() {
    return {
      closeClient: (client: TelegramClient) => this.context.closeClient(client),
      saveSession: (client: TelegramClient) => this.saveSession(client),
      getProfile: (client: TelegramClient, user?: Api.User | null) =>
        this.context.getAccountProfileFromClient(client, user),
    };
  }

  async getSelfUserWithDetails(client: TelegramClient, fallback?: Api.User) {
    try {
      const full = await client.invoke(
        new Api.users.GetFullUser({ id: new Api.InputUserSelf() }),
      );
      const users = ((full as any)?.users || []) as any[];
      const meId = fallback ? String((fallback as any).id) : null;
      const exact = meId ? users.find((u) => String(u?.id) === meId) : null;
      const candidate = (exact || users[0] || fallback) as Api.User | undefined;
      return candidate || fallback || null;
    } catch {
      return fallback || null;
    }
  }

  async startLogin(
    apiId: string,
    apiHash: string,
    phone: string,
    forceSms = false,
  ) {
    return startTelegramPhoneLogin(apiId, apiHash, phone, forceSms, {
      createClient: () => this.context.createClient({ apiId, apiHash }),
      ...this.loginAdapterDependencies(),
    });
  }

  async loginWithQr(
    apiId: string,
    apiHash: string,
    signal: AbortSignal,
    onProgress: (progress: TelegramQrLoginProgress) => void | Promise<void>,
  ) {
    return loginWithTelegramQr(apiId, apiHash, signal, onProgress, {
      createClient: (operationSignal) =>
        this.context.createClient({ apiId, apiHash }, operationSignal),
      closeClient: (client) => this.context.closeClient(client),
      saveSession: (client) => this.saveSession(client),
      getProfile: (client, user) =>
        this.context.getAccountProfileFromClient(client, user),
    });
  }

  async signInWithCode(params: {
    apiId: string;
    apiHash: string;
    phone: string;
    phoneCodeHash: string;
    code: string;
    tempSession?: string;
  }) {
    return signInTelegramWithCode(params, {
      createClient: (session) =>
        this.context.createClient({
          apiId: params.apiId,
          apiHash: params.apiHash,
          session,
        }),
      ...this.loginAdapterDependencies(),
    });
  }

  async signInWithPassword(params: {
    apiId: string;
    apiHash: string;
    password: string;
    tempSession?: string;
  }) {
    return signInTelegramWithPassword(params, {
      createClient: (session) =>
        this.context.createClient({
          apiId: params.apiId,
          apiHash: params.apiHash,
          session,
        }),
      ...this.loginAdapterDependencies(),
    });
  }

  async getAccountProfile(params: Required<TelegramMtprotoSessionCredentials>) {
    return withTelegramReadDeadline({
      timeoutMs: this.context.telegramMetadataTimeoutMs,
      label: 'Telegram account profile',
      create: (signal) => this.context.createClient(params, signal),
      close: (client) => this.context.closeClient(client),
      run: (client) => this.context.getAccountProfileFromClient(client),
    });
  }

  async getMe(params: { apiId: string; apiHash: string; session: string }) {
    const profile = await this.getAccountProfile(params);
    return {
      id: profile.id,
      username: profile.username,
      firstName: profile.firstName,
      lastName: profile.lastName,
      photoUrl: profile.photoUrl,
      nameColor: profile.nameColor,
    };
  }

  async getAdminChannels(params: {
    apiId: string;
    apiHash: string;
    session: string;
  }) {
    const client = await this.context.createClient(params);
    try {
      const dialogs = await client.getDialogs({ limit: 200 });
      return dialogs
        .filter((d: any) => {
          if (!d?.isChannel) return false;
          const entity = d.entity;
          return !!(entity?.creator || entity?.adminRights);
        })
        .map((d: any) => ({
          id: String(d.id),
          title: d.title || 'Untitled',
          username: d.entity?.username || null,
          isCreator: !!d.entity?.creator,
          adminRights: this.context.toJsonSafe(d.entity?.adminRights) as Record<
            string,
            unknown
          > | null,
        }));
    } finally {
      await this.context.closeClient(client);
    }
  }

  async getAdminChannelsWithProfile(
    params: {
      apiId: string;
      apiHash: string;
      session: string;
    },
    options: { includeChannelPhotos?: boolean } = {},
  ) {
    const client = await this.context.createClient(params);
    try {
      const [dialogs, profile] = await Promise.all([
        client.getDialogs({ limit: 200 }),
        this.context.getAccountProfileFromClient(client),
      ]);
      const adminDialogs = dialogs.filter((d: any) => {
        if (!d?.isChannel) return false;
        const entity = d.entity;
        return !!(entity?.creator || entity?.adminRights);
      });
      const channels = await runBounded(adminDialogs, 4, async (d: any) => ({
        id: String(d.id),
        title: d.title || 'Untitled',
        username: d.entity?.username || null,
        photoUrl:
          options.includeChannelPhotos !== false && d.entity?.photo
            ? await this.context.profilePhotoDataUrl(client, d.entity, false)
            : null,
        isCreator: !!d.entity?.creator,
        adminRights: this.context.toJsonSafe(d.entity?.adminRights) as Record<
          string,
          unknown
        > | null,
      }));
      return { channels, profile, complete: dialogs.length < 200 };
    } finally {
      await this.context.closeClient(client);
    }
  }
}

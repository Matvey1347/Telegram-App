import { telegramPublicPhotoUrl } from './telegram-mtproto-account-profile';
import { Api, TelegramClient } from 'telegram';
import {
  normalizeTelegramUsername,
  type ResolvedTelegramEntity,
} from '@api/telegram/shared/imports/telegram-import.helpers';
import { maskTelegramReferenceForLog } from '@api/telegram/shared/invites/telegram-invite-log';
import { livePending } from '@api/telegram/shared/mtproto/telegram-pending-join-requests';
import {
  type ImportableTelegramEntity,
  type TelegramChannelAccessMode,
} from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  elapsed: TelegramMtprotoClient['elapsed'];
  entityAccessHash: TelegramMtprotoClient['entityAccessHash'];
  logger: TelegramMtprotoClient['logger'];
  now: TelegramMtprotoClient['now'];
  profilePhotoDataUrl: TelegramMtprotoClient['profilePhotoDataUrl'];
  telegramMetadataTimeoutMs: TelegramMtprotoClient['telegramMetadataTimeoutMs'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toJsonSafe: TelegramMtprotoClient['toJsonSafe'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
};

export class TelegramMtprotoChannelMetadata {
  constructor(private readonly context: Dependencies) {}

  inferAccessMode(params: {
    username?: string | null;
    inviteLink?: string | null;
    requiresJoinRequest?: boolean;
  }): TelegramChannelAccessMode {
    if (params.username) return 'PUBLIC';
    if (params.requiresJoinRequest) return 'PRIVATE_JOIN_REQUEST';
    if (params.inviteLink) return 'PRIVATE_INVITE';
    return 'PRIVATE';
  }

  entityIdToString(entity: { id?: unknown }) {
    if (typeof entity.id === 'bigint') return entity.id.toString();
    if (entity.id == null) return '';
    return String(entity.id);
  }

  entityKind(entity: ImportableTelegramEntity): 'channel' | 'person' {
    return entity instanceof Api.User ? 'person' : 'channel';
  }

  entityTitle(entity: ImportableTelegramEntity) {
    if (entity instanceof Api.User) {
      return [entity.firstName, entity.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
    }
    return String(entity.title || '').trim();
  }

  async describeEntity(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    fallbackRef: string,
    rawExtra?: Record<string, unknown>,
    accessOnly = false,
  ): Promise<ResolvedTelegramEntity & { raw: Record<string, unknown> }> {
    const startedAt = this.context.now();
    this.context.logger.log(
      `Describing Telegram entity: kind=${this.entityKind(entity)} id=${this.entityIdToString(entity) || 'n/a'} fallback=${maskTelegramReferenceForLog(fallbackRef)}`,
    );
    let fullChannel: unknown = null;
    if (!(entity instanceof Api.User)) {
      try {
        const fullStartedAt = this.context.now();
        const full = await this.context.withTimeout(
          client.invoke(new Api.channels.GetFullChannel({ channel: entity })),
          this.context.telegramMetadataTimeoutMs,
          'Telegram full channel lookup',
        );
        fullChannel = (full as { fullChat?: unknown }).fullChat || null;
        this.context.logger.log(
          `Telegram full channel lookup completed in ${this.context.elapsed(fullStartedAt)}: id=${this.entityIdToString(entity) || 'n/a'}`,
        );
      } catch {
        fullChannel = null;
        this.context.logger.warn(
          `Telegram full channel lookup failed or timed out for id=${this.entityIdToString(entity) || 'n/a'}`,
        );
      }
    }

    const username = normalizeTelegramUsername(
      (entity as { username?: string | null }).username,
    );
    const requiresJoinRequest = Boolean(
      rawExtra?.requiresJoinRequest ||
      (entity as { joinToSend?: boolean }).joinToSend ||
      (fullChannel as { requestsPending?: unknown } | null)?.requestsPending ||
      (fullChannel as { joinRequestsEnabled?: unknown } | null)
        ?.joinRequestsEnabled,
    );
    const inviteLink =
      typeof rawExtra?.inviteLink === 'string' && rawExtra.inviteLink.trim()
        ? rawExtra.inviteLink.trim()
        : null;
    const telegramAccessHash = this.context.entityAccessHash(entity);
    const firstName =
      entity instanceof Api.User
        ? String(entity.firstName || '') || null
        : null;
    const lastName =
      entity instanceof Api.User ? String(entity.lastName || '') || null : null;
    const participantsCount =
      this.context.toFiniteNumber(
        (fullChannel as { participantsCount?: unknown } | null)
          ?.participantsCount,
      ) ??
      this.context.toFiniteNumber(
        (entity as { participantsCount?: unknown }).participantsCount,
      );
    let pendingJoinRequestsError: string | null = null;
    const pendingJoinRequestsCount = accessOnly
      ? null
      : await livePending(
          client,
          entity,
          fullChannel,
          (request) =>
            this.context.withTimeout(
              request,
              this.context.telegramMetadataTimeoutMs,
              'Telegram pending join requests lookup',
            ),
          (code) => {
            pendingJoinRequestsError = code;
          },
        );
    const photoUrl = accessOnly
      ? null
      : (await this.context.profilePhotoDataUrl(client, entity)) ||
        telegramPublicPhotoUrl(username);
    this.context.logger.log(
      `Telegram entity described in ${this.context.elapsed(startedAt)}: kind=${this.entityKind(entity)} id=${this.entityIdToString(entity) || 'n/a'} username=${username || 'n/a'}`,
    );
    return {
      kind: this.entityKind(entity),
      isCreator: Boolean('creator' in entity && entity.creator),
      adminRights: this.context.toJsonSafe(
        ('adminRights' in entity && entity.adminRights) || null,
      ) as Record<string, unknown> | null,
      telegramChatId: this.entityIdToString(entity),
      title: this.entityTitle(entity) || username || fallbackRef,
      username,
      description:
        ((fullChannel as { about?: string | null } | null)?.about as
          | string
          | null) || null,
      participantsCount,
      pendingJoinRequestsCount,
      pendingJoinRequestsError,
      canViewStats:
        fullChannel instanceof Api.ChannelFull
          ? Boolean(fullChannel.canViewStats)
          : null,
      photoUrl,
      telegramAccessHash,
      accessMode: this.inferAccessMode({
        username,
        inviteLink,
        requiresJoinRequest,
      }),
      requiresJoinRequest,
      inviteLink,
      raw: {
        ...(rawExtra || {}),
        entity: this.context.toJsonSafe({
          id: this.entityIdToString(entity),
          title: this.entityTitle(entity),
          firstName,
          lastName,
          username,
          accessHash: telegramAccessHash,
          participantsCount: (entity as { participantsCount?: unknown })
            .participantsCount,
        }),
        fullChannel: this.context.toJsonSafe({
          about: (fullChannel as { about?: unknown } | null)?.about,
          participantsCount: (
            fullChannel as { participantsCount?: unknown } | null
          )?.participantsCount,
          requestsPending: (fullChannel as { requestsPending?: unknown } | null)
            ?.requestsPending,
        }),
      },
    };
  }
}

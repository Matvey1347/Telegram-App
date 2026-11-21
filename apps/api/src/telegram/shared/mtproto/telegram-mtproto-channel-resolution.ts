import type { TelegramMtprotoChannelMetadata } from './telegram-mtproto-channel-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import {
  MatchScore,
  canonicalTelegramInviteLink,
  normalizeTelegramUsername,
  resolveTelegramTitleCandidates,
  type ResolvedTelegramEntity,
  type TelegramTitleCandidate,
} from '@api/telegram/shared/imports/telegram-import.helpers';
import {
  maskTelegramInviteHash,
  maskTelegramReferenceForLog,
} from '@api/telegram/shared/invites/telegram-invite-log';
import {
  type ImportableTelegramEntity,
  type StoredTelegramChannelReference,
  type ResolvedStoredTelegramChannel,
} from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  resolveStoredChannel: TelegramMtprotoClient['resolveStoredChannel'];
  closeClient: TelegramMtprotoClient['closeClient'];
  createClient: TelegramMtprotoClient['createClient'];
  describeEntity: TelegramMtprotoChannelMetadata['describeEntity'];
  elapsed: TelegramMtprotoClient['elapsed'];
  entityIdToString: TelegramMtprotoChannelMetadata['entityIdToString'];
  entityKind: TelegramMtprotoChannelMetadata['entityKind'];
  entityTitle: TelegramMtprotoChannelMetadata['entityTitle'];
  errorSummary: TelegramMtprotoClient['errorSummary'];
  inferAccessMode: TelegramMtprotoChannelMetadata['inferAccessMode'];
  logger: TelegramMtprotoClient['logger'];
  normalizeChatId: TelegramMtprotoClient['normalizeChatId'];
  now: TelegramMtprotoClient['now'];
  telegramResolveTimeoutMs: TelegramMtprotoClient['telegramResolveTimeoutMs'];
  toBigInt: TelegramMtprotoClient['toBigInt'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toJsonSafe: TelegramMtprotoClient['toJsonSafe'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
};

export class TelegramMtprotoChannelResolution {
  constructor(private readonly context: Dependencies) {}

  private isImportableTelegramEntity(
    entity: unknown,
  ): entity is ImportableTelegramEntity {
    return (
      entity instanceof Api.User ||
      entity instanceof Api.Channel ||
      entity instanceof Api.Chat
    );
  }

  asImportableTelegramEntity(
    entity: unknown,
    context: string,
  ): ImportableTelegramEntity {
    if (this.isImportableTelegramEntity(entity)) {
      return entity;
    }
    throw new BadRequestException(
      `Telegram ${context} could not be resolved to a supported entity.`,
    );
  }

  private inviteErrorCode(error: unknown) {
    const candidate = error as {
      errorMessage?: string;
      message?: string;
      errorCode?: string;
    };
    const raw =
      candidate?.errorMessage ||
      candidate?.errorCode ||
      candidate?.message ||
      '';
    const match = String(raw).match(/[A-Z_]+/);
    return match?.[0] || '';
  }

  mapInviteError(error: unknown): never {
    const code = this.inviteErrorCode(error);
    switch (code) {
      case 'INVITE_HASH_INVALID':
        throw new BadRequestException('Telegram invite link is invalid.');
      case 'INVITE_HASH_EXPIRED':
        throw new BadRequestException('Telegram invite link has expired.');
      case 'INVITE_REQUEST_SENT':
        throw new ConflictException(
          'Join request was sent. Wait for approval and retry the import.',
        );
      case 'CHANNELS_TOO_MUCH':
        throw new ForbiddenException(
          'The connected Telegram account has reached its channel limit.',
        );
      default:
        throw error;
    }
  }

  private searchResultCandidates(result: unknown): ImportableTelegramEntity[] {
    const users = Array.isArray((result as { users?: unknown[] } | null)?.users)
      ? (result as { users: unknown[] }).users
      : [];
    const chats = Array.isArray((result as { chats?: unknown[] } | null)?.chats)
      ? (result as { chats: unknown[] }).chats
      : [];
    return [...chats, ...users].filter((entity) =>
      this.isImportableTelegramEntity(entity),
    );
  }

  private dedupeTitleCandidates(
    candidates: Array<TelegramTitleCandidate<ImportableTelegramEntity>>,
  ) {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = `${candidate.kind}:${candidate.entityId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async titleCandidates(client: TelegramClient, titleQuery: string) {
    const dialogs = await client.getDialogs({ limit: 300 });
    const dialogCandidates = dialogs
      .map((dialog: unknown) => {
        const row = dialog as { title?: string; entity?: unknown };
        if (!this.isImportableTelegramEntity(row.entity)) return null;
        return {
          entity: row.entity,
          entityId: this.context.entityIdToString(row.entity),
          kind: this.context.entityKind(row.entity),
          title: String(
            row.title || this.context.entityTitle(row.entity),
          ).trim(),
          username: normalizeTelegramUsername(
            (row.entity as { username?: string | null }).username,
          ),
          source: 'dialogs' as const,
        };
      })
      .filter(Boolean) as Array<
      TelegramTitleCandidate<ImportableTelegramEntity>
    >;

    const searchResult = await client.invoke(
      new Api.contacts.Search({ q: titleQuery, limit: 50 }),
    );
    const searchCandidates = this.searchResultCandidates(searchResult).map(
      (entity) => ({
        entity,
        entityId: this.context.entityIdToString(entity),
        kind: this.context.entityKind(entity),
        title: this.context.entityTitle(entity),
        username: normalizeTelegramUsername(
          (entity as { username?: string | null }).username,
        ),
        source: 'search' as const,
      }),
    );

    return this.dedupeTitleCandidates([
      ...dialogCandidates,
      ...searchCandidates,
    ]);
  }

  private suggestionsMessage(
    titleQuery: string,
    suggestions: Array<{ title: string; username: string | null }>,
  ) {
    if (!suggestions.length) {
      return 'Private channels that are not accessible to the connected Telegram account require an invite link.';
    }
    const rendered = suggestions
      .slice(0, 5)
      .map((item) =>
        item.username ? `${item.title} (@${item.username})` : item.title,
      )
      .join(', ');
    return `Channel "${titleQuery}" was not found. Possible matches: ${rendered}.`;
  }

  private async dialogCandidates(client: TelegramClient) {
    const dialogs = await this.context.withTimeout(
      client.getDialogs({ limit: 300 }),
      this.context.telegramResolveTimeoutMs,
      'Telegram channel dialogs',
    );
    return dialogs
      .map((dialog: unknown) => {
        const row = dialog as { title?: string; entity?: unknown };
        if (!this.isImportableTelegramEntity(row.entity)) return null;
        return {
          title: String(
            row.title || this.context.entityTitle(row.entity),
          ).trim(),
          entity: row.entity,
        };
      })
      .filter(Boolean) as Array<{
      title: string;
      entity: ImportableTelegramEntity;
    }>;
  }

  private async findDialogEntityByChatId(
    client: TelegramClient,
    telegramChatId?: string | null,
  ) {
    const normalizedChatId = this.context.normalizeChatId(telegramChatId);
    if (!normalizedChatId) return null;
    const dialogs = await this.dialogCandidates(client);
    return (
      dialogs.find(
        (dialog) =>
          this.context.normalizeChatId(
            this.context.entityIdToString(dialog.entity),
          ) === normalizedChatId,
      )?.entity || null
    );
  }

  private storedInputPeer(channel: StoredTelegramChannelReference) {
    const channelId = this.context.toBigInt(channel.telegramChatId);
    const accessHash = this.context.toBigInt(channel.telegramAccessHash);
    if (!channelId || accessHash == null) return null;
    return new Api.InputPeerChannel({
      channelId: channelId as any,
      accessHash: accessHash as any,
    });
  }

  private async tryResolveEntity(
    client: TelegramClient,
    ref: unknown,
  ): Promise<ImportableTelegramEntity | null> {
    if (ref == null) return null;
    try {
      const entity = await client.getEntity(ref as never);
      return this.isImportableTelegramEntity(entity) ? entity : null;
    } catch {
      return null;
    }
  }

  private async tryResolvePeer(
    client: TelegramClient,
    ref: unknown,
  ): Promise<Api.TypeInputPeer | null> {
    if (ref == null) return null;
    try {
      return await client.getInputEntity(ref as never);
    } catch {
      return null;
    }
  }

  public async resolveStoredChannel(
    client: TelegramClient,
    channel: StoredTelegramChannelReference,
    accessOnly = false,
  ): Promise<ResolvedStoredTelegramChannel> {
    const expectedId = this.context.normalizeChatId(channel.telegramChatId);
    const matches = (
      entity: ImportableTelegramEntity | null,
    ): entity is Api.Channel =>
      entity instanceof Api.Channel &&
      (!expectedId ||
        this.context.normalizeChatId(String(entity.id)) === expectedId);
    const resolve = async (
      entity: Api.Channel,
      peer: Api.TypeInputPeer,
      resolvedBy: 'dialog-id' | 'stored-peer' | 'username' | 'invite-link',
      described?: ResolvedTelegramEntity,
    ): Promise<ResolvedStoredTelegramChannel> => {
      const info =
        described ??
        (await this.context.describeEntity(
          client,
          entity,
          channel.username || expectedId || 'Telegram channel',
          { inviteLink: channel.inviteLink || null },
          accessOnly,
        ));
      return {
        entity,
        peer,
        channel: {
          ...info,
          telegramAccessHash:
            info.telegramAccessHash || channel.telegramAccessHash || null,
          inviteLink: info.inviteLink || channel.inviteLink || null,
          accessMode:
            info.accessMode ||
            this.context.inferAccessMode({
              username: info.username,
              inviteLink: info.inviteLink || channel.inviteLink || null,
              requiresJoinRequest: info.requiresJoinRequest,
            }),
          requiresJoinRequest: Boolean(info.requiresJoinRequest),
          resolvedBy,
        },
      };
    };

    const storedPeer = this.storedInputPeer(channel);
    if (storedPeer) {
      const entity = await this.tryResolveEntity(client, storedPeer);
      if (matches(entity)) return resolve(entity, storedPeer, 'stored-peer');
    }

    const username = normalizeTelegramUsername(channel.username);
    if (username) {
      const entity = await this.tryResolveEntity(client, `@${username}`);
      if (matches(entity)) {
        const peer = await this.tryResolvePeer(client, entity);
        if (peer) return resolve(entity, peer, 'username');
      }
    }

    const dialogEntity = await this.findDialogEntityByChatId(
      client,
      channel.telegramChatId,
    );
    if (matches(dialogEntity)) {
      const peer = await this.tryResolvePeer(client, dialogEntity);
      if (peer) return resolve(dialogEntity, peer, 'dialog-id');
    }

    const inviteHash = String(channel.inviteLink || '').match(
      /(?:joinchat\/|\+)([A-Za-z0-9_-]+)/i,
    )?.[1];
    if (inviteHash) {
      const info = await this.resolveInviteLinkInfo(
        client,
        'Telegram channel',
        inviteHash,
      );
      if (
        !expectedId ||
        this.context.normalizeChatId(info.telegramChatId) === expectedId
      ) {
        const storedInvitePeer = this.storedInputPeer(info);
        const entity = await this.tryResolveEntity(
          client,
          storedInvitePeer || (info.username ? `@${info.username}` : null),
        );
        if (matches(entity)) {
          const peer =
            (await this.tryResolvePeer(client, entity)) || storedInvitePeer;
          if (peer) return resolve(entity, peer, 'invite-link', info);
        }
      }
    }

    throw new BadRequestException(
      'Could not resolve the Telegram channel for this connected account.',
    );
  }

  private async importEntityFromInviteUpdates(
    client: TelegramClient,
    updates: unknown,
    fallbackRef: string,
    inviteLink: string,
    joinedByInvite: boolean,
  ) {
    const candidates = this.searchResultCandidates(updates);
    const entity =
      candidates.find(
        (candidate) =>
          candidate instanceof Api.Channel || candidate instanceof Api.Chat,
      ) || candidates[0];
    if (!entity) {
      throw new BadRequestException(
        'Could not resolve a real Telegram channel from the invite link.',
      );
    }
    const described = await this.context.describeEntity(
      client,
      entity,
      fallbackRef,
      {
        inviteLink,
        joinedByInvite,
      },
    );
    return {
      ...described,
      inviteLink,
      joinedByInvite,
    };
  }

  private async findInviteAlreadyEntity(
    client: TelegramClient,
    invite: Api.ChatInviteAlready,
    fallbackRef: string,
    inviteLink: string,
  ) {
    let entity: unknown = invite.chat;
    try {
      entity = await client.getEntity(invite.chat);
    } catch (error) {
      this.context.logger.warn(
        'Telegram invite was already joined but peer lookup failed; using the channel returned by CheckChatInvite.',
      );
    }
    if (!this.isImportableTelegramEntity(entity)) {
      throw new BadRequestException(
        'Could not resolve a real Telegram channel from the invite link.',
      );
    }
    const described = await this.context.describeEntity(
      client,
      entity,
      fallbackRef,
      {
        invite: this.context.toJsonSafe(invite),
      },
    );
    return {
      ...described,
      inviteLink,
      joinedByInvite: false,
    };
  }

  private async resolveInviteParticipantConflict(
    client: TelegramClient,
    inviteLink: string,
    previewTitle: string,
  ) {
    const normalizedTitle = previewTitle.normalize('NFKC').trim();
    const dialogs = await this.dialogCandidates(client);
    const exactDialogs = dialogs.filter(
      (dialog) => dialog.title.normalize('NFKC').trim() === normalizedTitle,
    );
    if (exactDialogs.length !== 1) {
      throw new BadRequestException(
        'Could not resolve a real Telegram channel from the invite link.',
      );
    }
    const described = await this.context.describeEntity(
      client,
      exactDialogs[0].entity,
      previewTitle,
      { matchedBy: 'invite-participant-conflict' },
    );
    return {
      ...described,
      inviteLink,
      joinedByInvite: false,
    };
  }

  private async resolveInviteLinkInfo(
    client: TelegramClient,
    fallbackRef: string,
    inviteHash: string,
  ) {
    const inviteLink = canonicalTelegramInviteLink(inviteHash);
    const maskedInvite = maskTelegramInviteHash(inviteHash);
    this.context.logger.log(
      `Resolving Telegram invite link: invite=${maskedInvite} fallback=${maskTelegramReferenceForLog(fallbackRef)}`,
    );
    let invite: Api.TypeChatInvite;
    try {
      const checkStartedAt = this.context.now();
      this.context.logger.log(
        `Checking Telegram invite: invite=${maskedInvite}`,
      );
      invite = await this.context.withTimeout(
        client.invoke(new Api.messages.CheckChatInvite({ hash: inviteHash })),
        this.context.telegramResolveTimeoutMs,
        'Telegram invite check',
      );
      this.context.logger.log(
        `Telegram invite check completed in ${this.context.elapsed(checkStartedAt)}: invite=${maskedInvite} result=${invite?.constructor?.name || 'unknown'}`,
      );
    } catch (error) {
      this.context.logger.error(
        `Telegram invite check failed: invite=${maskedInvite}`,
        JSON.stringify(this.context.errorSummary(error)),
      );
      this.mapInviteError(error);
    }

    if (invite instanceof Api.ChatInviteAlready) {
      this.context.logger.log(
        `Telegram invite already joined: invite=${maskedInvite}`,
      );
      return this.findInviteAlreadyEntity(
        client,
        invite,
        fallbackRef,
        inviteLink,
      );
    }

    // ImportChatInvite changes the user's Telegram membership and can submit a
    // join request that third-party bots immediately react to. A channel may
    // be imported by public username without joining; a private invite must
    // first be joined explicitly by the user in Telegram.
    return this.joinRequestInvitePreview(invite, fallbackRef, inviteLink);
  }

  private joinRequestInvitePreview(
    invite: Api.TypeChatInvite,
    fallbackRef: string,
    inviteLink: string,
  ): ResolvedTelegramEntity {
    const preview = invite as {
      title?: unknown;
      about?: unknown;
      participantsCount?: unknown;
    };
    return {
      kind: 'channel',
      telegramChatId: '',
      title: String(preview.title || fallbackRef).trim() || fallbackRef,
      username: null,
      description: typeof preview.about === 'string' ? preview.about : null,
      participantsCount: this.context.toFiniteNumber(preview.participantsCount),
      photoUrl: null,
      inviteLink,
      joinedByInvite: false,
      accessMode: 'PRIVATE_JOIN_REQUEST',
      requiresJoinRequest: true,
    };
  }

  private async resolveTitleInfo(client: TelegramClient, titleQuery: string) {
    const candidates = await this.titleCandidates(client, titleQuery);
    const resolved = resolveTelegramTitleCandidates(titleQuery, candidates);
    if (!resolved.resolved) {
      throw new BadRequestException(
        this.suggestionsMessage(titleQuery, resolved.suggestions),
      );
    }
    return this.context.describeEntity(
      client,
      resolved.resolved.entity,
      titleQuery,
      {
        matchedBy:
          resolved.resolved.score === MatchScore.EXACT_USERNAME
            ? 'exact-username'
            : 'exact-title',
      },
    );
  }

  async getPublicChannelInfo(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    inviteHash?: string;
    accessOnly?: boolean;
  }) {
    const startedAt = this.context.now();
    this.context.logger.log(
      `Starting Telegram public channel lookup: ref=${maskTelegramReferenceForLog(params.channelRef || params.channel?.telegramChatId || params.channel?.username)} invite=${maskTelegramInviteHash(params.inviteHash)}`,
    );
    const signal = AbortSignal.timeout(30_000);
    const client = await this.context.withTimeout(
      this.context.createClient(params, signal),
      30_000,
      'Telegram channel connection',
    );
    const abortRead = () => void this.context.closeClient(client);
    signal.addEventListener('abort', abortRead, { once: true });
    try {
      if (params.inviteHash) {
        const resolved = await this.resolveInviteLinkInfo(
          client,
          params.channelRef || params.channel?.inviteLink || 'Telegram channel',
          params.inviteHash,
        );
        this.context.logger.log(
          `Telegram invite-based lookup finished in ${this.context.elapsed(startedAt)}: ref=${maskTelegramReferenceForLog(params.channelRef || params.channel?.telegramChatId)} chatId=${resolved.telegramChatId || 'n/a'}`,
        );
        return resolved;
      }

      if (params.channel) {
        const resolved = await this.context.withTimeout(
          this.context.resolveStoredChannel(
            client,
            params.channel,
            params.accessOnly,
          ),
          30_000,
          'Telegram channel metadata',
        );
        this.context.logger.log(
          `Telegram stored-channel lookup finished in ${this.context.elapsed(startedAt)}: chatId=${resolved.channel.telegramChatId || 'n/a'} via=${resolved.channel.resolvedBy}`,
        );
        return resolved.channel;
      }

      const entityStartedAt = this.context.now();
      const entity = await this.context.withTimeout(
        client.getEntity(params.channelRef as string),
        this.context.telegramResolveTimeoutMs,
        'Telegram entity lookup',
      );
      this.context.logger.log(
        `Telegram entity lookup completed in ${this.context.elapsed(entityStartedAt)}: ref=${maskTelegramReferenceForLog(params.channelRef)} type=${entity?.constructor?.name || 'unknown'}`,
      );
      if (!this.isImportableTelegramEntity(entity)) {
        throw new BadRequestException(
          `Cannot find any entity corresponding to "${params.channelRef}"`,
        );
      }
      const described = await this.context.describeEntity(
        client,
        entity,
        params.channelRef || 'Telegram channel',
      );
      this.context.logger.log(
        `Telegram public channel lookup finished in ${this.context.elapsed(startedAt)}: ref=${maskTelegramReferenceForLog(params.channelRef)} chatId=${described.telegramChatId || 'n/a'}`,
      );
      return described;
    } finally {
      signal.removeEventListener('abort', abortRead);
      await this.context.closeClient(client);
    }
  }

  /**
   * Joins a private invite only when an import explicitly needs access to its
   * channel. A join-request invite remains pending until Telegram approves it
   * and is deliberately not represented as a channel without a real chat ID.
   */
  async joinPrivateChannelByInvite(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef: string;
    inviteHash: string;
  }) {
    const client = await this.context.createClient(params);
    const inviteLink = canonicalTelegramInviteLink(params.inviteHash);
    try {
      let updates: unknown;
      try {
        updates = await this.context.withTimeout(
          client.invoke(
            new Api.messages.ImportChatInvite({ hash: params.inviteHash }),
          ),
          this.context.telegramResolveTimeoutMs,
          'Telegram private channel join',
        );
      } catch (error) {
        this.mapInviteError(error);
      }
      return this.importEntityFromInviteUpdates(
        client,
        updates,
        params.channelRef,
        inviteLink,
        true,
      );
    } finally {
      await this.context.closeClient(client);
    }
  }

  async findAccessibleChannelInfoByTitle(params: {
    apiId: string;
    apiHash: string;
    session: string;
    titleQuery: string;
  }) {
    const client = await this.context.createClient(params);
    try {
      return this.resolveTitleInfo(client, params.titleQuery);
    } finally {
      await this.context.closeClient(client);
    }
  }
}

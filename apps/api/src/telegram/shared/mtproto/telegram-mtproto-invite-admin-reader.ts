import { BadRequestException } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import type { TelegramInviteLinksResult } from './telegram-invite-links.types';
import { normalizeTelegramUsername } from '@api/telegram/shared/imports/telegram-import.helpers';
import { type ImportableTelegramEntity } from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  entityAccessHashValue: TelegramMtprotoClient['entityAccessHashValue'];
  getTelegramErrorCode: TelegramMtprotoClient['getTelegramErrorCode'];
  logger: TelegramMtprotoClient['logger'];
  maxInviteLinkPages: TelegramMtprotoClient['maxInviteLinkPages'];
  profilePhotoDataUrl: TelegramMtprotoClient['profilePhotoDataUrl'];
  telegramResolveTimeoutMs: TelegramMtprotoClient['telegramResolveTimeoutMs'];
  toBigInt: TelegramMtprotoClient['toBigInt'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toTelegramDate: TelegramMtprotoClient['toTelegramDate'];
  unwrapExportedChatInvite: TelegramMtprotoClient['unwrapExportedChatInvite'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
};

export class TelegramMtprotoInviteAdminReader {
  constructor(private readonly context: Dependencies) {}

  private readonly inviteLinksPageSize = 100;

  private userSnapshotCompleteness(user: Api.User) {
    return {
      hasAccessHash: Boolean(this.context.entityAccessHashValue(user)),
      isMin: Boolean(user.min),
      hasUsername: Boolean(normalizeTelegramUsername(user.username)),
      hasName: Boolean(user.firstName || user.lastName),
      hasPhoto: Boolean(user.photo),
      isDeleted: Boolean(user.deleted),
    };
  }

  private choosePreferredUser(current: Api.User | null, incoming: Api.User) {
    if (!current) return incoming;
    const currentScore = this.userSnapshotCompleteness(current);
    const incomingScore = this.userSnapshotCompleteness(incoming);

    if (currentScore.hasAccessHash !== incomingScore.hasAccessHash) {
      return incomingScore.hasAccessHash ? incoming : current;
    }
    if (currentScore.isMin !== incomingScore.isMin) {
      return incomingScore.isMin ? current : incoming;
    }
    if (currentScore.isDeleted !== incomingScore.isDeleted) {
      return incomingScore.isDeleted ? current : incoming;
    }
    if (currentScore.hasUsername !== incomingScore.hasUsername) {
      return incomingScore.hasUsername ? incoming : current;
    }
    if (currentScore.hasName !== incomingScore.hasName) {
      return incomingScore.hasName ? incoming : current;
    }
    if (currentScore.hasPhoto !== incomingScore.hasPhoto) {
      return incomingScore.hasPhoto ? incoming : current;
    }
    return current;
  }

  rememberKnownUser(
    knownUsers: Map<string, Api.User>,
    user: Api.User,
    source: string,
  ) {
    const userId = String(user.id);
    const previous = knownUsers.get(userId) ?? null;
    const preferred = this.choosePreferredUser(previous, user);
    knownUsers.set(userId, preferred);

    if (preferred !== previous || !previous) {
      this.logInviteSyncEvent('log', {
        phase: 'invite_admin_catalog',
        source,
        adminId: userId,
        username: normalizeTelegramUsername(preferred.username),
        userClass: preferred.className,
        min: Boolean(preferred.min),
        bot: Boolean(preferred.bot),
        deleted: Boolean(preferred.deleted),
        self: Boolean(preferred.self),
        hasAccessHash: Boolean(this.context.entityAccessHashValue(preferred)),
        accessHashType: typeof (preferred as { accessHash?: unknown })
          .accessHash,
        accessHashCtor:
          (preferred as { accessHash?: { constructor?: { name?: string } } })
            .accessHash?.constructor?.name ?? null,
      });
    }
  }

  private isInputUser(entity: unknown): entity is Api.TypeInputUser {
    return (
      entity instanceof Api.InputUser ||
      entity instanceof Api.InputUserFromMessage ||
      entity instanceof Api.InputUserSelf
    );
  }

  public async getInviteAdminPhotoUrl(client: TelegramClient, user: Api.User) {
    // Invite creators can have a Telegram-generated initials/emoji avatar but no
    // downloadable profile photo. Do not persist a guessed public URL: Telegram
    // commonly returns a 404 for those profiles and the UI must render the
    // creator name fallback instead.
    return this.context.profilePhotoDataUrl(client, user);
  }

  inviteAdminUserId(row: unknown) {
    const record = row as Record<string, unknown> | null;
    const value = record?.adminId ?? record?.userId ?? null;
    if (typeof value === 'bigint') return value.toString();
    if (value == null) return null;
    return String(value);
  }

  inviteAdminCounts(row: unknown) {
    const record = row as Record<string, unknown> | null;
    return {
      active: Math.max(
        0,
        this.context.toFiniteNumber(record?.invitesCount) ?? 0,
      ),
      revoked: Math.max(
        0,
        this.context.toFiniteNumber(record?.revokedInvitesCount) ?? 0,
      ),
    };
  }

  logInviteSyncEvent(
    level: 'log' | 'warn' | 'error',
    payload: Record<string, unknown>,
  ) {
    this.context.logger[level](JSON.stringify(payload));
  }

  async loadChannelInviteAdminsDirectory(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    warnings: string[],
  ) {
    const usersById = new Map<string, Api.User>();
    let offset = 0;
    const limit = 200;

    for (let page = 0; page < 10; page += 1) {
      try {
        const response = (await this.context.withTimeout(
          client.invoke(
            new Api.channels.GetParticipants({
              channel: entity as any,
              filter: new Api.ChannelParticipantsAdmins(),
              offset,
              limit,
              hash: BigInt(0) as any,
            }),
          ),
          this.context.telegramResolveTimeoutMs,
          'Telegram channel admins request',
        )) as any;
        const users = Array.isArray(response?.users) ? response.users : [];
        for (const user of users) {
          if (user instanceof Api.User) {
            usersById.set(String(user.id), user);
          }
        }
        const participants = Array.isArray(response?.participants)
          ? response.participants
          : [];
        if (!participants.length || participants.length < limit) {
          break;
        }
        offset += participants.length;
      } catch (error) {
        warnings.push(
          `Telegram admin directory lookup failed: ${this.context.getTelegramErrorCode(error)}`,
        );
        break;
      }
    }

    return usersById;
  }

  async resolveInviteAdminInputUser(params: {
    client: TelegramClient;
    user: Api.User;
    selfUserId: string | null;
    channelTelegramId?: string | null;
    connectedTelegramUserId?: string | null;
  }) {
    if (params.selfUserId && String(params.user.id) === params.selfUserId) {
      return new Api.InputUserSelf();
    }

    const directAccessHash = this.context.entityAccessHashValue(params.user);
    if (directAccessHash) {
      try {
        const inputUser = new Api.InputUser({
          userId: params.user.id,
          accessHash: directAccessHash as any,
        });
        this.logInviteSyncEvent('log', {
          phase: 'resolve_invite_admin',
          channelTelegramId: params.channelTelegramId ?? null,
          connectedTelegramUserId: params.connectedTelegramUserId ?? null,
          adminId: String(params.user.id),
          strategy: 'direct_access_hash',
          inputUserClass: inputUser.className,
        });
        return inputUser;
      } catch {
        // Fall through to GramJS entity resolution.
      }
    }

    const attemptErrors: Array<{ strategy: string; errorCode: string }> = [];
    const resolutionCandidates: unknown[] = [params.user];
    const username = normalizeTelegramUsername(params.user.username);
    if (username) {
      resolutionCandidates.push(`@${username}`);
    }
    resolutionCandidates.push(
      new Api.PeerUser({
        userId: String(params.user.id) as any,
      }),
    );

    for (const candidate of resolutionCandidates) {
      const strategy =
        typeof candidate === 'string'
          ? 'username'
          : candidate instanceof Api.User
            ? 'user_object'
            : candidate instanceof Api.PeerUser
              ? 'peer_user'
              : 'unknown';
      try {
        const resolved = await this.context.withTimeout(
          params.client.getInputEntity(candidate as never),
          this.context.telegramResolveTimeoutMs,
          'Telegram admin entity resolution',
        );
        if (this.isInputUser(resolved)) {
          this.logInviteSyncEvent('log', {
            phase: 'resolve_invite_admin',
            channelTelegramId: params.channelTelegramId ?? null,
            connectedTelegramUserId: params.connectedTelegramUserId ?? null,
            adminId: String(params.user.id),
            strategy,
            inputUserClass:
              (resolved as { className?: string }).className ?? null,
          });
          return resolved;
        }
      } catch (error) {
        attemptErrors.push({
          strategy,
          errorCode: this.context.getTelegramErrorCode(error),
        });
      }
    }

    this.logInviteSyncEvent('warn', {
      phase: 'resolve_invite_admin',
      channelTelegramId: params.channelTelegramId ?? null,
      connectedTelegramUserId: params.connectedTelegramUserId ?? null,
      adminId: String(params.user.id),
      errors: attemptErrors,
    });

    throw new BadRequestException(
      `Telegram admin ${String(params.user.id)} could not be resolved as an input user.`,
    );
  }

  private async fetchInviteLinksPage(params: {
    client: TelegramClient;
    peer: ImportableTelegramEntity;
    adminId: Api.TypeInputUser;
    revoked: boolean;
    offsetDate: number;
    offsetLink: string;
  }) {
    return this.context.withTimeout(
      params.client.invoke(
        new Api.messages.GetExportedChatInvites({
          peer: params.peer as any,
          adminId: params.adminId,
          offsetDate: params.offsetDate,
          offsetLink: params.offsetLink,
          limit: this.inviteLinksPageSize,
          revoked: params.revoked,
        }),
      ),
      this.context.telegramResolveTimeoutMs,
      'Telegram exported chat invites request',
    );
  }

  async collectInviteLinksForAdmin(params: {
    client: TelegramClient;
    peer: ImportableTelegramEntity;
    adminId: Api.TypeInputUser;
    adminUser: Api.User;
    knownUsers: Map<string, Api.User>;
    revoked: boolean;
    expectedCount?: number;
    createdFrom?: Date | null;
    warnings: string[];
    onInviteLinkLoaded?: (
      link: TelegramInviteLinksResult['links'][number],
    ) => void | Promise<void>;
  }) {
    const links: TelegramInviteLinksResult['links'] = [];
    const seenUrls = new Set<string>();
    let offsetDate = 0;
    let offsetLink = '';
    let previousCursor = '';
    let pagesLoaded = 0;
    let stoppedByCutoff = false;
    const photoUrlCache = new Map<string, string | null>();

    const observedUrls = new Set<string>();
    let advertisedCount: number | null = null;
    let complete = false;
    let invalidInvite = false;
    for (let page = 0; page < this.context.maxInviteLinkPages; page += 1) {
      const response = await this.fetchInviteLinksPage({
        client: params.client,
        peer: params.peer,
        adminId: params.adminId,
        revoked: params.revoked,
        offsetDate,
        offsetLink,
      }).catch((error: unknown) => {
        if (!pagesLoaded) throw error;
        params.warnings.push(
          'An invite-link page could not be read; earlier pages were preserved.',
        );
        return null;
      });
      if (!response) break;
      pagesLoaded += 1;
      const responseUsers = Array.isArray(response?.users)
        ? response.users
        : [];
      for (const user of responseUsers) {
        if (user instanceof Api.User) {
          this.rememberKnownUser(
            params.knownUsers,
            user,
            `GetExportedChatInvites:${params.revoked ? 'revoked' : 'active'}`,
          );
        }
      }
      const invites = Array.isArray(response?.invites) ? response.invites : [];
      advertisedCount =
        this.context.toFiniteNumber(response?.count) ?? advertisedCount;
      if (!Array.isArray(response?.invites)) break;
      if (!invites.length) {
        complete =
          observedUrls.size === (advertisedCount ?? params.expectedCount);
        break;
      }
      const pageDates = invites
        .map((invite) =>
          this.context.toTelegramDate(
            this.context.unwrapExportedChatInvite(invite)?.date,
          ),
        )
        .filter((date): date is Date => Boolean(date))
        .map((date) => date.getTime());
      const pageSortedNewToOld =
        pageDates.length > 1 &&
        pageDates.every(
          (value, index) => index === 0 || value <= pageDates[index - 1]!,
        );

      for (const invite of invites) {
        const resolvedInvite = this.context.unwrapExportedChatInvite(invite);
        const url = String(resolvedInvite?.link || '').trim();
        const creatorId = this.context
          .toBigInt(resolvedInvite?.adminId)
          ?.toString();
        if (!url || !creatorId) {
          invalidInvite = true;
          continue;
        }
        observedUrls.add(url);
        if (seenUrls.has(url)) continue;
        const creator = params.knownUsers.get(creatorId);
        if (creator && !photoUrlCache.has(creatorId)) {
          photoUrlCache.set(
            creatorId,
            await this.getInviteAdminPhotoUrl(params.client, creator),
          );
        }
        const createdAt = this.context.toTelegramDate(resolvedInvite?.date);
        if (params.createdFrom) {
          if (!createdAt) {
            invalidInvite = true;
            params.warnings.push(
              'Invite creation date is unavailable for the configured cutoff.',
            );
            continue;
          }
          if (createdAt.getTime() < params.createdFrom.getTime()) {
            stoppedByCutoff = true;
            if (pageSortedNewToOld) {
              break;
            }
            continue;
          }
        }
        seenUrls.add(url);
        links.push({
          url,
          title:
            typeof resolvedInvite?.title === 'string' &&
            resolvedInvite.title.trim()
              ? resolvedInvite.title
              : null,
          telegramCreatorUserId: creatorId,
          creatorUsername: normalizeTelegramUsername(creator?.username),
          creatorFirstName: creator?.firstName || null,
          creatorLastName: creator?.lastName || null,
          creatorPhotoUrl: photoUrlCache.get(creatorId) ?? null,
          createdAt,
          startDate: this.context.toTelegramDate(resolvedInvite?.startDate),
          expireDate: this.context.toTelegramDate(resolvedInvite?.expireDate),
          usageLimit: this.context.toFiniteNumber(resolvedInvite?.usageLimit),
          usage: this.context.toFiniteNumber(resolvedInvite?.usage) ?? 0,
          requested:
            this.context.toFiniteNumber(resolvedInvite?.requested) ?? 0,
          usageObserved:
            this.context.toFiniteNumber(resolvedInvite?.usage) != null,
          requestedObserved:
            this.context.toFiniteNumber(resolvedInvite?.requested) != null ||
            !resolvedInvite?.requestNeeded,
          requestNeeded: Boolean(resolvedInvite?.requestNeeded),
          permanent: Boolean(resolvedInvite?.permanent),
          revoked: Boolean(resolvedInvite?.revoked),
        });
        await params.onInviteLinkLoaded?.(links[links.length - 1]);
      }
      if (stoppedByCutoff && pageSortedNewToOld) {
        complete = true;
        break;
      }

      const lastInvite = this.context.unwrapExportedChatInvite(
        invites[invites.length - 1],
      );
      const nextOffsetDate = this.context.toFiniteNumber(lastInvite?.date) ?? 0;
      const nextOffsetLink = String(lastInvite?.link || '');
      const nextCursor = `${nextOffsetDate}:${nextOffsetLink}`;
      if (!nextOffsetLink || !nextOffsetDate) break;
      if (observedUrls.size === (advertisedCount ?? params.expectedCount)) {
        complete = true;
        break;
      }
      if (nextCursor === previousCursor) {
        params.warnings.push(
          `Invite-link pagination stopped early for admin ${String(params.adminUser.id)} because Telegram returned the same cursor twice.`,
        );
        break;
      }
      previousCursor = nextCursor;
      offsetDate = nextOffsetDate;
      offsetLink = nextOffsetLink;
    }

    return { links, pagesLoaded, complete: complete && !invalidInvite };
  }

  async getInviteCreatorWithDetails(
    client: TelegramClient,
    fallback: Api.User,
  ) {
    try {
      const inputUser = await this.resolveInviteAdminInputUser({
        client,
        user: fallback,
        selfUserId: fallback.self ? String(fallback.id) : null,
      });
      const response = (await this.context.withTimeout(
        client.invoke(new Api.users.GetFullUser({ id: inputUser })),
        this.context.telegramResolveTimeoutMs,
        'Telegram invite creator profile lookup',
      )) as { users?: unknown[] };
      return (
        (response.users ?? []).find(
          (user): user is Api.User =>
            user instanceof Api.User && String(user.id) === String(fallback.id),
        ) ?? fallback
      );
    } catch {
      return fallback;
    }
  }
}

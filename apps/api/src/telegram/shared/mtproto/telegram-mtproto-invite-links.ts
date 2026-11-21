import type { TelegramMtprotoChannelMetadata } from './telegram-mtproto-channel-metadata';
import type { TelegramMtprotoInviteAdminReader } from './telegram-mtproto-invite-admin-reader';
import type { TelegramMtprotoAccounts } from './telegram-mtproto-account';
import type { TelegramMtprotoChannelResolution } from './telegram-mtproto-channel-resolution';
import { BadRequestException } from '@nestjs/common';
import { Api, TelegramClient } from 'telegram';
import type { TelegramInviteLinksResult } from './telegram-invite-links.types';
import {
  canonicalTelegramInviteLink,
  normalizeTelegramUsername,
  parseTelegramImportInput,
} from '@api/telegram/shared/imports/telegram-import.helpers';
import { livePending } from '@api/telegram/shared/mtproto/telegram-pending-join-requests';
import {
  type ImportableTelegramEntity,
  type StoredTelegramChannelReference,
  type InviteAdminSummary,
  type ExportedInvitePayload,
  type InviteLinksProgressCallback,
  type InviteLinkLoadedCallback,
} from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  asImportableTelegramEntity: TelegramMtprotoChannelResolution['asImportableTelegramEntity'];
  closeClient: TelegramMtprotoClient['closeClient'];
  collectInviteLinksForAdmin: TelegramMtprotoClient['collectInviteLinksForAdmin'];
  createClient: TelegramMtprotoClient['createClient'];
  entityAccessHashValue: TelegramMtprotoClient['entityAccessHashValue'];
  entityIdToString: TelegramMtprotoChannelMetadata['entityIdToString'];
  getInviteAdminPhotoUrl: TelegramMtprotoClient['getInviteAdminPhotoUrl'];
  getInviteCreatorWithDetails: TelegramMtprotoClient['getInviteCreatorWithDetails'];
  getSelfUserWithDetails: TelegramMtprotoAccounts['getSelfUserWithDetails'];
  getTelegramErrorCode: TelegramMtprotoClient['getTelegramErrorCode'];
  inviteAdminCounts: TelegramMtprotoInviteAdminReader['inviteAdminCounts'];
  inviteAdminUserId: TelegramMtprotoInviteAdminReader['inviteAdminUserId'];
  loadChannelInviteAdminsDirectory: TelegramMtprotoClient['loadChannelInviteAdminsDirectory'];
  logInviteSyncEvent: TelegramMtprotoInviteAdminReader['logInviteSyncEvent'];
  mapInviteError: TelegramMtprotoClient['mapInviteError'];
  maxInviteLinkPages: TelegramMtprotoClient['maxInviteLinkPages'];
  rememberKnownUser: TelegramMtprotoClient['rememberKnownUser'];
  resolveInviteAdminInputUser: TelegramMtprotoClient['resolveInviteAdminInputUser'];
  resolveStoredChannel: TelegramMtprotoClient['resolveStoredChannel'];
  telegramMetadataTimeoutMs: TelegramMtprotoClient['telegramMetadataTimeoutMs'];
  telegramResolveTimeoutMs: TelegramMtprotoClient['telegramResolveTimeoutMs'];
  toBigInt: TelegramMtprotoClient['toBigInt'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toTelegramDate: TelegramMtprotoClient['toTelegramDate'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
};

export class TelegramMtprotoInviteLinks {
  constructor(private readonly context: Dependencies) {}

  public unwrapExportedChatInvite(
    invite: unknown,
  ): ExportedInvitePayload | null {
    if (!invite || typeof invite !== 'object') {
      return null;
    }

    const raw = invite as ExportedInvitePayload;

    if (typeof raw.link === 'string' && raw.link.trim()) {
      return raw;
    }

    const nestedCandidates = [raw.newInvite, raw.invite];
    for (const candidate of nestedCandidates) {
      if (
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as { link?: unknown }).link === 'string' &&
        String((candidate as { link?: unknown }).link || '').trim()
      ) {
        return candidate;
      }
    }

    return raw;
  }

  async getAllChannelInviteLinksInternal(
    client: TelegramClient,
    entity: ImportableTelegramEntity,
    onProgress?: InviteLinksProgressCallback,
    onInviteLinkLoaded?: InviteLinkLoadedCallback,
    createdFrom?: Date | null,
  ): Promise<TelegramInviteLinksResult> {
    const warnings: string[] = [];
    const channelTelegramId =
      this.context.entityIdToString(entity) || 'unknown';
    const selfUser = await this.context.getSelfUserWithDetails(
      client,
      await this.context.withTimeout(
        client.getMe(),
        this.context.telegramResolveTimeoutMs,
        'Telegram self lookup',
      ),
    );
    const connectedTelegramUserId = selfUser ? String(selfUser.id) : null;
    await onProgress?.({
      phase: 'discovering_invite_admins',
      message: 'Discovering invite-link creators',
    });
    const adminsResult = (await this.context.withTimeout(
      client.invoke(
        new Api.messages.GetAdminsWithInvites({ peer: entity as any }),
      ),
      this.context.telegramResolveTimeoutMs,
      'Telegram admins with invites request',
    )) as any;
    const knownUsers = new Map<string, Api.User>();
    const users = Array.isArray(adminsResult?.users) ? adminsResult.users : [];
    for (const user of users) {
      if (user instanceof Api.User) {
        this.context.rememberKnownUser(
          knownUsers,
          user,
          'GetAdminsWithInvites',
        );
      }
    }
    if (selfUser) {
      this.context.rememberKnownUser(knownUsers, selfUser, 'getMe/GetFullUser');
    }
    const adminDirectoryUsers =
      await this.context.loadChannelInviteAdminsDirectory(
        client,
        entity,
        warnings,
      );
    for (const [userId, user] of adminDirectoryUsers.entries()) {
      this.context.rememberKnownUser(knownUsers, user, 'GetParticipants');
    }

    const adminRows = Array.isArray(adminsResult?.admins)
      ? adminsResult.admins
      : [];
    const expectedTotalLinks = adminRows.reduce((sum: number, row: unknown) => {
      const counts = this.context.inviteAdminCounts(row);
      return sum + counts.active + counts.revoked;
    }, 0);
    this.context.logInviteSyncEvent('log', {
      phase: 'discovering_invite_admins',
      channelTelegramId,
      connectedTelegramUserId,
      adminRows: adminRows.length,
      expectedTotalLinks,
    });
    await onProgress?.({
      phase: 'loading_invite_links',
      message:
        expectedTotalLinks > 0
          ? `Loading invite links 0/${expectedTotalLinks}`
          : 'Loading invite links',
      stageCurrent: 0,
      stageTotal: expectedTotalLinks,
    });

    const summaries: InviteAdminSummary[] = [];
    const linksByUrl = new Map<
      string,
      TelegramInviteLinksResult['links'][number]
    >();
    const failedAdminWarningPattern = /^Admin .+ invite-link sync failed: /;
    const fallbackAdminUser =
      selfUser ?? knownUsers.values().next().value ?? null;
    let failedAdmins = 0;
    let partialPages = !Array.isArray(adminsResult?.admins);
    let attemptedAdmins = 0;
    let loadedLinksCount = 0;

    for (const row of adminRows) {
      const adminUserId = this.context.inviteAdminUserId(row);
      const counts = this.context.inviteAdminCounts(row);
      const shouldFetch = counts.active > 0 || counts.revoked > 0;
      const adminUser = adminUserId
        ? (knownUsers.get(adminUserId) ?? null)
        : null;

      if (adminUser) {
        summaries.push({
          telegramUserId: adminUserId!,
          username: normalizeTelegramUsername(adminUser.username),
          firstName: adminUser.firstName || null,
          lastName: adminUser.lastName || null,
          photoUrl: await this.context.getInviteAdminPhotoUrl(
            client,
            adminUser,
          ),
          activeLinksCount: counts.active,
          revokedLinksCount: counts.revoked,
        });
      }

      if (!shouldFetch) continue;
      attemptedAdmins += 1;
      if (!adminUserId || !adminUser) {
        failedAdmins += 1;
        warnings.push(
          `Admin ${adminUserId || 'unknown'} could not be resolved from Telegram users payload.`,
        );
        continue;
      }

      try {
        this.context.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          username: normalizeTelegramUsername(adminUser.username),
          userClass: adminUser.className,
          min: Boolean(adminUser.min),
          bot: Boolean(adminUser.bot),
          deleted: Boolean(adminUser.deleted),
          self: Boolean(adminUser.self),
          hasAccessHash: Boolean(this.context.entityAccessHashValue(adminUser)),
          accessHashType: typeof (adminUser as { accessHash?: unknown })
            .accessHash,
          accessHashCtor:
            (adminUser as { accessHash?: { constructor?: { name?: string } } })
              .accessHash?.constructor?.name ?? null,
          expectedActiveLinks: counts.active,
          expectedRevokedLinks: counts.revoked,
        });
        const inputUser = await this.context.resolveInviteAdminInputUser({
          client,
          user: adminUser,
          selfUserId: connectedTelegramUserId,
          channelTelegramId,
          connectedTelegramUserId,
        });
        this.context.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          resolutionStrategy:
            inputUser instanceof Api.InputUserSelf
              ? 'self'
              : inputUser instanceof Api.InputUser
                ? 'direct_input_user'
                : ((inputUser as { className?: string }).className ??
                  'unknown'),
          inputUserClass:
            (inputUser as { className?: string }).className ?? null,
        });
        const branches = await Promise.allSettled([
          this.context.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: inputUser,
            adminUser,
            knownUsers,
            revoked: false,
            expectedCount: counts.active,
            createdFrom,
            warnings,
            onInviteLinkLoaded: async (link) => {
              loadedLinksCount += 1;
              await onProgress?.({
                phase: 'loading_invite_links',
                message: `Loading invite links ${loadedLinksCount}/${expectedTotalLinks}`,
                stageCurrent: loadedLinksCount,
                stageTotal: expectedTotalLinks,
              });
              await onInviteLinkLoaded?.(
                link,
                loadedLinksCount,
                expectedTotalLinks,
                warnings,
              );
            },
          }),
          this.context.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: inputUser,
            adminUser,
            knownUsers,
            revoked: true,
            expectedCount: counts.revoked,
            createdFrom,
            warnings,
            onInviteLinkLoaded: async (link) => {
              loadedLinksCount += 1;
              await onProgress?.({
                phase: 'loading_invite_links',
                message: `Loading invite links ${loadedLinksCount}/${expectedTotalLinks}`,
                stageCurrent: loadedLinksCount,
                stageTotal: expectedTotalLinks,
              });
              await onInviteLinkLoaded?.(
                link,
                loadedLinksCount,
                expectedTotalLinks,
                warnings,
              );
            },
          }),
        ]);
        const branchResult = (branch: (typeof branches)[number]) => {
          if (branch.status === 'fulfilled') return branch.value;
          warnings.push(
            `Admin ${adminUserId} invite branch failed: ${this.context.getTelegramErrorCode(branch.reason).match(/^[A-Z][A-Z0-9_]{1,79}$/u)?.[0] ?? 'UNAVAILABLE'}`,
          );
          return { links: [], pagesLoaded: 0, complete: false };
        };
        const activeLinks = branchResult(branches[0]);
        const revokedLinks = branchResult(branches[1]);
        if (branches.every((branch) => branch.status === 'rejected')) {
          failedAdmins += 1;
        }
        partialPages ||= !activeLinks?.complete || !revokedLinks?.complete;
        for (const link of [...activeLinks.links, ...revokedLinks.links]) {
          linksByUrl.set(link.url, link);
        }
        this.context.logInviteSyncEvent('log', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          activePagesLoaded: activeLinks.pagesLoaded,
          revokedPagesLoaded: revokedLinks.pagesLoaded,
          activeLinksLoaded: activeLinks.links.length,
          revokedLinksLoaded: revokedLinks.links.length,
          loadedLinks: activeLinks.links.length + revokedLinks.links.length,
          totalUniqueLinks: linksByUrl.size,
        });
      } catch (error) {
        failedAdmins += 1;
        const errorCode = this.context.getTelegramErrorCode(error);
        warnings.push(
          `Admin ${adminUserId} invite-link sync failed: ${errorCode}`,
        );
        this.context.logInviteSyncEvent('warn', {
          phase: 'loading_invite_links',
          channelTelegramId,
          connectedTelegramUserId,
          adminId: adminUserId,
          errorCode,
        });
      }
    }

    const shouldTryGlobalFallback =
      expectedTotalLinks > linksByUrl.size &&
      (failedAdmins > 0 || linksByUrl.size === 0) &&
      fallbackAdminUser;
    if (shouldTryGlobalFallback) {
      this.context.logInviteSyncEvent('warn', {
        phase: 'loading_invite_links',
        channelTelegramId,
        connectedTelegramUserId,
        reason: 'global_input_user_empty_fallback',
        loadedLinksCount,
        expectedTotalLinks,
        failedAdmins,
      });
      const branches = await Promise.allSettled(
        [false, true].map((revoked) =>
          this.context.collectInviteLinksForAdmin({
            client,
            peer: entity,
            adminId: new Api.InputUserEmpty(),
            adminUser: fallbackAdminUser,
            knownUsers,
            revoked,
            createdFrom,
            warnings,
            expectedCount: adminRows.reduce((sum: number, row: unknown) => {
              const counts = this.context.inviteAdminCounts(row);
              return sum + (revoked ? counts.revoked : counts.active);
            }, 0),
          }),
        ),
      );
      for (const branch of branches) {
        if (branch.status === 'rejected') {
          warnings.push(
            'Global invite-link fallback could not read one branch.',
          );
          continue;
        }
        for (const link of branch.value.links) {
          if (!linksByUrl.has(link.url)) {
            loadedLinksCount += 1;
            await onInviteLinkLoaded?.(
              link,
              loadedLinksCount,
              expectedTotalLinks,
              warnings,
            );
            linksByUrl.set(link.url, link);
          }
        }
      }
      const countsByCreator = new Map<
        string,
        { active: number; revoked: number }
      >();
      for (const link of linksByUrl.values()) {
        const counts = countsByCreator.get(link.telegramCreatorUserId) ?? {
          active: 0,
          revoked: 0,
        };
        counts[link.revoked ? 'revoked' : 'active'] += 1;
        countsByCreator.set(link.telegramCreatorUserId, counts);
      }
      const covered = adminRows.every((row: unknown) => {
        const expected = this.context.inviteAdminCounts(row);
        const actual = countsByCreator.get(
          this.context.inviteAdminUserId(row) ?? '',
        );
        return (
          (actual?.active ?? 0) === expected.active &&
          (actual?.revoked ?? 0) === expected.revoked
        );
      });
      if (
        covered &&
        branches.every(
          (branch) => branch.status === 'fulfilled' && branch.value.complete,
        )
      ) {
        partialPages = false;
        failedAdmins = 0;
        for (let index = warnings.length - 1; index >= 0; index -= 1) {
          if (failedAdminWarningPattern.test(warnings[index] || ''))
            warnings.splice(index, 1);
        }
      }
    }

    if (
      attemptedAdmins > 0 &&
      failedAdmins >= attemptedAdmins &&
      !linksByUrl.size
    ) {
      throw new BadRequestException(
        'Telegram invite-link sync failed for every expected administrator.',
      );
    }

    const limitedToAdmin =
      entity instanceof Api.Channel &&
      !entity.creator &&
      Boolean(entity.adminRights);
    return {
      pendingJoinRequestsCount: await livePending(
        client,
        entity,
        null,
        (request) =>
          this.context.withTimeout(
            request,
            this.context.telegramMetadataTimeoutMs,
            'Telegram pending join requests lookup',
          ),
      ),
      scope:
        limitedToAdmin ||
        failedAdmins > 0 ||
        partialPages ||
        (!createdFrom && linksByUrl.size < expectedTotalLinks)
          ? 'PARTIAL_ADMINS'
          : 'ALL_ADMINS',
      expectedTotalLinks,
      admins: summaries,
      links: [...linksByUrl.values()],
      warnings,
    };
  }

  async getAllChannelInviteLinks(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
    onProgress?: InviteLinksProgressCallback;
  }) {
    const client = await this.context.createClient(params);
    try {
      const resolved = params.channel
        ? await this.context.resolveStoredChannel(client, params.channel)
        : null;
      const entity = resolved
        ? resolved.entity
        : await client.getEntity(params.channelRef as string);
      return await this.getAllChannelInviteLinksInternal(
        client,
        this.context.asImportableTelegramEntity(entity, 'channel'),
        params.onProgress,
        undefined,
        null,
      );
    } finally {
      await this.context.closeClient(client);
    }
  }

  async getChannelInviteLink(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channel: StoredTelegramChannelReference;
    inviteLink: string;
    joinedFrom?: Date | null;
    joinedUntil?: Date | null;
    includePendingSince?: boolean;
  }): Promise<TelegramInviteLinksResult['links'][number]> {
    const parsed = parseTelegramImportInput(params.inviteLink);
    if (parsed.type !== 'invite') {
      throw new BadRequestException(
        'Enter a valid private Telegram invite link.',
      );
    }
    const client = await this.context.createClient(params);
    try {
      const resolved = await this.context.resolveStoredChannel(
        client,
        params.channel,
      );
      let response: unknown;
      try {
        response = await this.context.withTimeout(
          client.invoke(
            new Api.messages.GetExportedChatInvite({
              peer: resolved.peer,
              link: parsed.inviteLink,
            }),
          ),
          this.context.telegramResolveTimeoutMs,
          'Telegram invite-link lookup',
        );
      } catch (error) {
        this.context.mapInviteError(error);
      }

      const invite = this.unwrapExportedChatInvite(response);
      const url = String(invite?.link || '').trim();
      const creatorTelegramUserId = this.context
        .toBigInt(invite?.adminId)
        ?.toString();
      if (!invite || !url || !creatorTelegramUserId) {
        throw new BadRequestException(
          'Telegram did not return this invite link for the selected channel.',
        );
      }
      const users = Array.isArray((response as { users?: unknown[] })?.users)
        ? (response as { users: unknown[] }).users
        : [];
      let creator = users.find(
        (user): user is Api.User =>
          user instanceof Api.User && String(user.id) === creatorTelegramUserId,
      );
      if (!creator) {
        const directory = await this.context.loadChannelInviteAdminsDirectory(
          client,
          this.context.asImportableTelegramEntity(resolved.entity, 'channel'),
          [],
        );
        creator = directory.get(creatorTelegramUserId) ?? creator;
      }
      creator = creator
        ? await this.context.getInviteCreatorWithDetails(client, creator)
        : undefined;
      const joinedWithinPeriod = params.joinedFrom
        ? await this.countInviteLinkJoinsInPeriod({
            client,
            peer: resolved.peer,
            inviteLink: parsed.inviteLink,
            from: params.joinedFrom,
            until: params.joinedUntil ?? new Date(),
          })
        : null;

      const pendingWithinPeriod =
        params.joinedFrom && params.includePendingSince
          ? await this.countInviteLinkJoinsInPeriod({
              client,
              peer: resolved.peer,
              inviteLink: parsed.inviteLink,
              from: params.joinedFrom,
              until: params.joinedUntil ?? new Date(),
              requested: true,
            })
          : undefined;

      return {
        url: canonicalTelegramInviteLink(parsed.inviteHash),
        title:
          typeof invite.title === 'string' && invite.title.trim()
            ? invite.title
            : null,
        telegramCreatorUserId: creatorTelegramUserId,
        creatorUsername: creator
          ? normalizeTelegramUsername(creator.username)
          : null,
        creatorFirstName: creator?.firstName || null,
        creatorLastName: creator?.lastName || null,
        creatorPhotoUrl: creator
          ? await this.context.getInviteAdminPhotoUrl(client, creator)
          : null,
        createdAt: this.context.toTelegramDate(invite.date),
        startDate: this.context.toTelegramDate(invite.startDate),
        expireDate: this.context.toTelegramDate(invite.expireDate),
        usageLimit: this.context.toFiniteNumber(invite.usageLimit),
        usage: this.context.toFiniteNumber(invite.usage) ?? 0,
        requested: this.context.toFiniteNumber(invite.requested) ?? 0,
        usageObserved: this.context.toFiniteNumber(invite.usage) != null,
        requestedObserved:
          this.context.toFiniteNumber(invite.requested) != null ||
          !invite.requestNeeded,
        requestNeeded: Boolean(invite.requestNeeded),
        permanent: Boolean(invite.permanent),
        revoked: Boolean(invite.revoked),
        joinedWithinPeriod,
        ...(params.includePendingSince
          ? { pendingWithinPeriod: pendingWithinPeriod ?? null }
          : {}),
      };
    } finally {
      await this.context.closeClient(client);
    }
  }

  private async countInviteLinkJoinsInPeriod(params: {
    client: TelegramClient;
    peer: Api.TypeInputPeer;
    inviteLink: string;
    from: Date;
    until: Date;
    requested?: boolean;
  }): Promise<number | null> {
    const limit = 100;
    let offsetDate = 0;
    let offsetUser: Api.TypeInputUser = new Api.InputUserEmpty();
    let count = 0;
    const seen = new Set<string>();
    let previousCursor = '';

    try {
      for (let page = 0; page < this.context.maxInviteLinkPages; page += 1) {
        const response = (await this.context.withTimeout(
          params.client.invoke(
            new Api.messages.GetChatInviteImporters({
              peer: params.peer,
              link: params.inviteLink,
              requested: params.requested === true,
              offsetDate,
              offsetUser,
              limit,
            }),
          ),
          this.context.telegramResolveTimeoutMs,
          'Telegram invite-link importers lookup',
        )) as {
          count?: number;
          importers?: Array<{ date?: unknown; userId?: unknown }>;
          users?: unknown[];
        };
        const { importers, count: total } = response;
        if (
          !Array.isArray(importers) ||
          typeof total !== 'number' ||
          !Number.isSafeInteger(total) ||
          total < 0
        )
          return null;
        let previousDate = offsetDate || Number.POSITIVE_INFINITY;
        let reachedBeforePeriod = false;
        for (const importer of importers) {
          const joinedAt = this.context.toTelegramDate(importer.date);
          const userId = this.context.toBigInt(importer.userId)?.toString();
          if (
            !joinedAt ||
            !userId ||
            seen.has(userId) ||
            joinedAt.getTime() / 1000 > previousDate
          )
            return null;
          seen.add(userId);
          previousDate = joinedAt.getTime() / 1000;
          if (joinedAt < params.from) reachedBeforePeriod = true;
          else if (joinedAt < params.until) count += 1;
        }
        if (seen.size > total) return null;
        if (reachedBeforePeriod || seen.size === total) return count;
        if (!importers.length) return null;

        const last = importers[importers.length - 1];
        const lastUserId = this.context.toBigInt(last.userId)?.toString();
        const lastUser = (response.users ?? []).find(
          (user): user is Api.User =>
            user instanceof Api.User && String(user.id) === lastUserId,
        );
        const nextOffsetDate = this.context.toFiniteNumber(last.date) ?? 0;
        const nextCursor = `${nextOffsetDate}:${lastUserId ?? ''}`;
        if (!lastUser || nextCursor === previousCursor) return null;
        offsetDate = nextOffsetDate;
        offsetUser = await this.context.resolveInviteAdminInputUser({
          client: params.client,
          user: lastUser,
          selfUserId: null,
        });
        previousCursor = nextCursor;
      }
      return null;
    } catch {
      return null;
    }
  }
}

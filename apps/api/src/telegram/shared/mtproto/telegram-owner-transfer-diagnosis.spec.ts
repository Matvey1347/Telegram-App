import { TelegramChannelAccessService } from '../../../domains/telegram/telegram-channels/telegram-channel-access.service';
import {
  TelegramChannelDataType,
  TelegramChannelSourceRole,
  TelegramSourceType,
} from '@prisma/client';
import { Api, type TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import { TelegramSourceAccessService } from '../imports/telegram-source-access.service';
import { TelegramMtprotoClient } from './telegram-mtproto.client';

function inviteReader(creatorId: number) {
  const mtproto = new TelegramMtprotoClient();
  const actor = new Api.User({
    id: returnBigInt(creatorId),
    self: true,
    firstName: 'Fixture administrator',
  });
  const peer = new Api.Channel({
    id: returnBigInt(creatorId + 1),
    title: 'Fixture channel',
    date: 0,
    photo: new Api.ChatPhotoEmpty(),
    broadcast: true,
  });
  jest.spyOn(mtproto, 'getInviteAdminPhotoUrl').mockResolvedValue(null);
  return { mtproto, actor, peer };
}

describe('Owner transfer diagnosis — regression coverage', () => {
  it.each(['deleted', 'published', 'other channel'] as const)(
    'OT-05 requires an explicit cancellation ACK for the exact channel (%s)',
    async (outcome) => {
      const mtproto = new TelegramMtprotoClient();
      const channelId = returnBigInt(407);
      const peer = new Api.InputPeerChannel({ channelId, accessHash: returnBigInt(1) });
      const update = new Api.UpdateDeleteScheduledMessages({
        peer: new Api.PeerChannel({ channelId: outcome === 'other channel' ? returnBigInt(408) : channelId }),
        messages: [17],
        sentMessages: outcome === 'published' ? [99] : undefined,
      });
      const client = {
        getInputEntity: jest.fn().mockResolvedValue(peer),
        invoke: jest.fn().mockResolvedValue(new Api.UpdateShort({ update, date: 1 })),
      } as unknown as TelegramClient;
      jest.spyOn(mtproto, 'createClient').mockResolvedValue(client);
      jest.spyOn(mtproto, 'closeClient').mockResolvedValue(undefined);
      const deletion = mtproto.deleteScheduledPost({
        apiId: '1', apiHash: 'fixture', session: 'fixture', channelRef: '@fixture',
        messageIds: ['17'], scheduleAt: new Date(Date.now() + 300_000),
      });
      if (outcome === 'deleted') await expect(deletion).resolves.toBeUndefined();
      else await expect(deletion).rejects.toThrow('did not acknowledge');
    },
  );

  it.each([false, true])(
    'OT-01 skips an owner without the invite capability (alternative owner flag %p)',
    async (alternativeIsOwner) => {
      const service = new TelegramSourceAccessService({} as never);
      const source = (
        id: string,
        role: TelegramChannelSourceRole,
        canManageInviteLinks: boolean,
      ) => ({
        sourceId: id,
        sourceType: TelegramSourceType.MTPROTO,
        role,
        canBeUsedForAnalytics: true,
        permissions: { canManageInviteLinks },
      });
      const old = source(
        'previous-actor',
        TelegramChannelSourceRole.OWNER,
        false,
      );
      const fresh = source(
        'eligible-actor',
        alternativeIsOwner
          ? TelegramChannelSourceRole.OWNER
          : TelegramChannelSourceRole.ADMIN,
        true,
      );
      jest
        .spyOn(service, 'sourcesForChannel')
        .mockResolvedValue([old, fresh] as never);
      const selected = await service.bestMtprotoSource(
        'workspace',
        'channel',
        TelegramChannelDataType.INVITE_LINKS,
      );
      expect(selected?.sourceId).toBe(fresh.sourceId);
      expect(selected?.permissions.canManageInviteLinks).toBe(true);
    },
  );

  it('probes a new admin when the stored owner cannot resolve the channel', async () => {
    const catalog = new TelegramSourceAccessService({} as never);
    const oldRights = catalog.normalizeMtprotoPermissions({ isCreator: true });
    const newRights = catalog.normalizeMtprotoPermissions({ adminRights: { inviteUsers: true } });
    jest.spyOn(catalog, 'sourcesForChannel').mockResolvedValue([
      { sourceId: 'old', sourceType: 'MTPROTO', ...oldRights },
      { sourceId: 'new', sourceType: 'MTPROTO', ...newRights },
    ] as never);
    const upsert = jest.spyOn(catalog, 'upsertAccess').mockResolvedValue({} as never);
    const lookup = jest.fn().mockRejectedValueOnce(new Error('CHANNEL_PRIVATE')).mockResolvedValueOnce({
      kind: 'channel', telegramChatId: '423', isCreator: false, adminRights: { inviteUsers: true },
    });
    const access = new TelegramChannelAccessService({} as never, {} as never, { getPublicChannelInfo: lookup } as never,
      catalog, {} as never, {} as never, {} as never, { normalizeChatId: (id: string) => id } as never);
    jest.spyOn(access, 'connectedAccount').mockImplementation(async (_workspace, _channel, id) => ({ id }) as never);
    jest.spyOn(access, 'accountCredentials').mockReturnValue({ apiId: '1', apiHash: 'fixture', session: 'fixture' });
    const result = await access.verifiedSyncAccount('workspace', {
      id: 'channel', username: 'fixture_ch', telegramChatId: '423',
    }, TelegramChannelDataType.INVITE_LINKS);
    expect(result.id).toBe('new');
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('uses separate readers for history, invite links and stats without repeating the same access probe', async () => {
    const catalog = new TelegramSourceAccessService({} as never);
    const actors = [
      { sourceId: 'history', permissions: { adminRights: { postMessages: true, editMessages: true, deleteMessages: true }, canViewStats: false } },
      { sourceId: 'invites', permissions: { adminRights: { inviteUsers: true }, canViewStats: false } },
      { sourceId: 'stats', permissions: { canViewStats: true } },
    ];
    jest.spyOn(catalog, 'sourcesForChannel').mockResolvedValue(actors.map(({ sourceId, permissions }) => ({
      sourceId, sourceType: 'MTPROTO', ...catalog.normalizeMtprotoPermissions(permissions),
    })) as never);
    jest.spyOn(catalog, 'upsertAccess').mockResolvedValue({} as never);
    const lookup = jest.fn(async ({ session }: { session: string }) => ({
      kind: 'channel', telegramChatId: '423', ...actors.find((actor) => actor.sourceId === session)?.permissions,
    }));
    const access = new TelegramChannelAccessService({} as never, {} as never, { getPublicChannelInfo: lookup } as never,
      catalog, {} as never, {} as never, {} as never, { normalizeChatId: (id: string) => id } as never);
    jest.spyOn(access, 'connectedAccount').mockImplementation(async (_workspace, _channel, id) =>
      ({ id, sessionEncrypted: id }) as never);
    jest.spyOn(access, 'accountCredentials').mockImplementation((account) => ({
      apiId: '1', apiHash: 'fixture', session: account.sessionEncrypted ?? '',
    }));
    const channel = { id: 'channel', username: 'fixture_ch', telegramChatId: '423' };
    const reads = new Map();
    for (const [type, actor] of [
      [TelegramChannelDataType.POSTS, 'history'],
      [TelegramChannelDataType.INVITE_LINKS, 'invites'],
      [TelegramChannelDataType.STATS, 'stats'],
    ] as const) {
      await expect(access.verifiedSyncAccount('workspace', channel, type, undefined, reads)).resolves.toMatchObject({ id: actor });
    }
    await access.verifiedSyncAccount('workspace', channel, TelegramChannelDataType.INVITE_LINKS, undefined, reads);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it.each([2, 5, 8])(
    'OT-02 marks a short successful page partial with %d links advertised',
    async (expected) => {
      const { mtproto, actor, peer } = inviteReader(expected * 100);
      const invoke = jest.fn((request: unknown) => {
        if (request instanceof Api.users.GetFullUser) return { users: [actor] };
        if (request instanceof Api.channels.GetParticipants)
          return { users: [actor], participants: [] };
        if (request instanceof Api.messages.GetAdminsWithInvites) {
          return {
            admins: [{ adminId: actor.id, invitesCount: expected }],
            users: [actor],
          };
        }
        if (request instanceof Api.messages.GetExportedChatInvites) {
          if (expected === 8 && request.offsetLink && !request.revoked) throw new Error('network interrupted');
          return {
            count: request.revoked ? 0 : expected,
            invites: request.revoked
              ? []
              : [
                  {
                    link: `https://t.me/+fixture_${expected}`,
                    adminId: actor.id,
                    date: 50,
                  },
                ],
            users: [actor],
          };
        }
        if (request instanceof Api.messages.GetChatInviteImporters)
          return { count: 0 };
        throw new Error('Unexpected RPC in fixture');
      });
      const client = {
        invoke,
        getMe: jest.fn().mockResolvedValue(actor),
      } as unknown as TelegramClient;
      const result = await mtproto['getAllChannelInviteLinksInternal'](
        client,
        peer,
      );
      expect(result.expectedTotalLinks).toBe(expected);
      expect(result.links).toHaveLength(1);
      expect(result.scope).toBe('PARTIAL_ADMINS');
      if (expected === 8) expect(result.warnings).toContain('An invite-link page could not be read; earlier pages were preserved.');
    },
  );

  it.each([false, true])(
    'OT-03 preserves unknown for incomplete importers (requested=%p)',
    async (requested) => {
      const { mtproto } = inviteReader(900);
      const client = {
        invoke: jest
          .fn()
          .mockResolvedValue({ count: 4, importers: [], users: [] }),
      } as unknown as TelegramClient;
      const count = await mtproto['inviteLinks']['countInviteLinkJoinsInPeriod']({
        client,
        peer: new Api.InputPeerSelf(),
        inviteLink: 'https://t.me/+fixture_importers',
        from: new Date('2026-11-01T00:00:00Z'),
        until: new Date('2026-11-20T00:00:00Z'),
        requested,
      });
      expect(count).toBeNull();
    },
  );

  it('OT-07 retains available post history when the invite directory denies access', async () => {
    const { mtproto, peer } = inviteReader(1200);
    const getMessages = jest
      .fn()
      .mockResolvedValue([{ date: '2026-11-14T12:00:00Z', views: 19 }]);
    const invoke = jest.fn(async (request: unknown) => {
      if (request instanceof Api.messages.GetAdminsWithInvites) {
        throw Object.assign(new Error('CHAT_ADMIN_REQUIRED'), {
          errorMessage: 'CHAT_ADMIN_REQUIRED',
        });
      }
      throw new Error('Unexpected RPC in fixture');
    });
    const client = {
      getEntity: jest.fn().mockResolvedValue(peer),
      getMe: jest.fn().mockResolvedValue(null),
      getMessages,
      invoke,
    } as unknown as TelegramClient;
    jest.spyOn(mtproto, 'createClient').mockResolvedValue(client);
    jest.spyOn(mtproto, 'closeClient').mockResolvedValue(undefined);
    await expect(
      mtproto.getChannelHistorical({
        apiId: '1',
        apiHash: 'synthetic',
        session: 'synthetic',
        channelRef: '@fixture',
        postLimit: 1,
      }),
    ).resolves.toMatchObject({
      dailyStats: [{ viewsCount: 19 }],
      inviteLinksScope: 'PARTIAL_ADMINS',
      inviteLinksDetailed: [],
    });
    expect(getMessages).toHaveBeenCalledWith(peer, { limit: 1 });
    expect(
      invoke.mock.calls.some(
        ([request]) => request instanceof Api.messages.GetAdminsWithInvites,
      ),
    ).toBe(true);
  });

  it('keeps the sign of a stored Telegram channel access hash', async () => {
    const { mtproto, peer } = inviteReader(1600);
    const getEntity = jest.fn(async (input: Api.InputPeerChannel) => {
      if (input.accessHash.toString() !== '-7123456789012345678') {
        throw new Error('CHANNEL_INVALID');
      }
      return peer;
    });
    const client = { getEntity, getDialogs: jest.fn().mockResolvedValue([]) } as unknown as TelegramClient;

    const resolved = await mtproto.resolveStoredChannel(
      client,
      { telegramChatId: `-100${peer.id}`, telegramAccessHash: '-7123456789012345678' },
      true,
    );

    expect(resolved.channel.resolvedBy).toBe('stored-peer');
    expect(getEntity).toHaveBeenCalledTimes(1);
  });

  it('OT-17 rejects the peer for a recycled username when it disagrees with the stored channel ID', async () => {
    const { mtproto, peer } = inviteReader(1700);
    const inputPeer = new Api.InputPeerChannel({
      channelId: peer.id,
      accessHash: returnBigInt(17),
    });
    const getEntity = jest.fn().mockResolvedValue(peer);
    const client = {
      getDialogs: jest.fn().mockResolvedValue([]),
      getEntity,
      getInputEntity: jest.fn().mockResolvedValue(inputPeer),
      invoke: jest.fn((request: unknown) =>
        request instanceof Api.messages.GetChatInviteImporters
          ? { count: 0 }
          : { fullChat: { participantsCount: 2 } },
      ),
    } as unknown as TelegramClient;
    const storedId = String(peer.id.add(1));
    await expect(mtproto.resolveStoredChannel(client, {
      telegramChatId: storedId, username: 'reused_fixture',
    })).rejects.toThrow('Could not resolve the Telegram channel');
    expect(client.getInputEntity).not.toHaveBeenCalled();
  });
});

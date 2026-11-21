import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';

function harness(alternateCount: number | null, alternateChat = '123') {
  const primary = { kind: 'channel', telegramChatId: '123', pendingJoinRequestsCount: null, pendingJoinRequestsError: 'CHAT_ADMIN_REQUIRED' };
  const prisma = { telegramChannel: {
    findFirst: jest.fn().mockResolvedValue({ id: 'channel', username: null, telegramChatId: '123' }),
    update: jest.fn().mockImplementation(async ({ data }) => ({ title: 'Channel', currentSubscribersCount: 100, pendingJoinRequestsCount: 99, ...data })),
  } };
  const mtproto = { getPublicChannelInfo: jest.fn().mockResolvedValueOnce(primary).mockResolvedValueOnce({ kind: 'channel', telegramChatId: alternateChat, pendingJoinRequestsCount: alternateCount }) };
  const sources = { sourcesForChannel: jest.fn().mockResolvedValue([{ sourceId: 'alternate', sourceType: 'MTPROTO', permissions: { canManageInviteLinks: true } }]), recordDataSource: jest.fn() };
  const access = {
    mtprotoChannelReference: jest.fn().mockReturnValue({ telegramChatId: '123' }),
    accountCredentials: jest.fn().mockImplementation((account) => ({ apiId: '1', apiHash: 'fixture', session: account.id })),
    connectedAccount: jest.fn().mockResolvedValue({ id: 'alternate' }),
    channelIdentityPatch: jest.fn().mockImplementation((info) => info.pendingJoinRequestsCount == null ? {} : { pendingJoinRequestsCount: info.pendingJoinRequestsCount }),
    sourceDisplayName: jest.fn().mockReturnValue('Primary'),
  };
  const service = new TelegramChannelHistoricalSyncService(prisma as never, mtproto as never, sources as never, { normalizeChatId: (id: string) => id } as never, access as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma, mtproto, sources, access };
}

describe('pending request account recovery', () => {
  it('uses a connected alternative with invite permissions and persists its verified count', async () => {
    const h = harness(76);
    const result = await h.service.syncPublicChannelInfo('workspace', 'channel', { id: 'primary' } as never);
    expect(result).toMatchObject({ pendingJoinRequestsCount: 76, pendingJoinRequestsVerified: true, pendingJoinRequestsSourceId: 'alternate' });
    expect(h.prisma.telegramChannel.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pendingJoinRequestsCount: 76 }) }));
    expect(h.access.connectedAccount).toHaveBeenCalledWith('workspace', 'channel', 'alternate');
  });
  it.each([[null, '123'], [0, 'different-channel']])('preserves prior count when alternative gives %s for %s', async (count, chat) => {
    const h = harness(count as number | null, chat as string);
    const result = await h.service.syncPublicChannelInfo('workspace', 'channel', { id: 'primary' } as never);
    expect(result).toMatchObject({ pendingJoinRequestsCount: null, pendingJoinRequestsVerified: false });
    expect(h.prisma.telegramChannel.update.mock.calls[0][0].data).not.toHaveProperty('pendingJoinRequestsCount');
    expect(h.sources.recordDataSource).toHaveBeenCalledWith(expect.objectContaining({ status: 'PARTIAL' }));
  });
});

import { TelegramChannelAccessService } from './telegram-channel-access.service';

describe('recovery reader selection', () => {
  it('uses the priority publisher even when an obsolete administrator is listed first', async () => {
    const sources = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'obsolete',
          sourceType: 'MTPROTO',
          permissions: { canPostMessages: true },
          mtprotoPublishingEnabled: true,
          isPriorityPublisher: false,
        },
        {
          sourceId: 'priority',
          sourceType: 'MTPROTO',
          permissions: { canPostMessages: true },
          mtprotoPublishingEnabled: true,
          isPriorityPublisher: true,
        },
      ]),
    };
    const service = new TelegramChannelAccessService(
      {} as never,
      {} as never,
      {} as never,
      sources as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const connected = jest
      .spyOn(service, 'connectedAccount')
      .mockResolvedValue({ id: 'priority' } as never);
    await expect(
      service.connectedRecoveryAccount('workspace', 'channel'),
    ).resolves.toMatchObject({ id: 'priority' });
    expect(connected).toHaveBeenCalledWith('workspace', 'channel', 'priority');
  });

  it('retains connected-account validation after choosing the priority source', async () => {
    const sources = {
      sourcesForChannel: jest.fn().mockResolvedValue([
        {
          sourceId: 'priority',
          sourceType: 'MTPROTO',
          permissions: { canPostMessages: true },
          mtprotoPublishingEnabled: true,
          isPriorityPublisher: true,
        },
      ]),
    };
    const service = new TelegramChannelAccessService(
      {} as never,
      {} as never,
      {} as never,
      sources as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    jest
      .spyOn(service, 'connectedAccount')
      .mockRejectedValue(new Error('Account disconnected'));
    await expect(
      service.connectedRecoveryAccount('workspace', 'channel'),
    ).rejects.toThrow('Account disconnected');
  });
});

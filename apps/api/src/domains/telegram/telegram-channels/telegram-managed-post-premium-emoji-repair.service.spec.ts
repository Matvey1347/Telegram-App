import { TelegramSourceType } from '@prisma/client';
import { TelegramManagedPostPremiumEmojiRepairService } from './telegram-managed-post-premium-emoji-repair.service';

describe('TelegramManagedPostPremiumEmojiRepairService', () => {
  const channel = {
    username: null,
    telegramChatId: '123',
    inviteLink: null,
    telegramAccessHash: '456',
  };

  function setup() {
    const mtprotoClient = {
      editPostText: jest.fn().mockResolvedValue({
        updatedCount: 1,
        unchangedCount: 0,
      }),
    };
    const access = {
      connectedAccount: jest.fn().mockResolvedValue({ id: 'premium-account' }),
      accountCredentials: jest.fn().mockReturnValue({
        apiId: '1',
        apiHash: 'hash',
        session: 'session',
      }),
      mtprotoChannelReference: jest.fn().mockReturnValue(channel),
    };
    return {
      service: new TelegramManagedPostPremiumEmojiRepairService(
        mtprotoClient as never,
        access as never,
      ),
      mtprotoClient,
      access,
    };
  }

  const params = {
    text: '![✨](tg://emoji?id=5368324170671202286) Offer',
    workspaceId: 'workspace-1',
    channelId: 'channel-1',
    channel,
    messageIds: ['42'],
    imageCount: 1,
    publishMode: 'MEDIA_WITH_CAPTION',
    captionHtml: '<tg-emoji emoji-id="5368324170671202286">✨</tg-emoji> Offer',
    followupHtmlParts: [],
    textHtmlParts: [],
  };

  it('repairs custom emoji on the bot-owned message through a premium editor', async () => {
    const { service, mtprotoClient, access } = setup();

    await service.restoreCustomEmojiAfterBotDelivery({
      ...params,
      sources: [
        {
          sourceId: 'bot',
          sourceType: TelegramSourceType.BOT,
          permissions: { canEditMessages: false },
        },
        {
          sourceId: 'premium-account',
          sourceType: TelegramSourceType.MTPROTO,
          isPremium: true,
          mtprotoPublishingEnabled: true,
          permissions: { canEditMessages: true },
        },
      ],
    });

    expect(access.connectedAccount).toHaveBeenCalledWith(
      'workspace-1',
      'channel-1',
      'premium-account',
    );
    expect(mtprotoClient.editPostText).toHaveBeenCalledWith(
      expect.objectContaining({
        messageIds: ['42'],
        imageCount: 1,
        captionHtml: params.captionHtml,
      }),
    );
  });

  it('does not add an MTProto call for ordinary Unicode emoji', async () => {
    const { service, mtprotoClient } = setup();

    await service.restoreCustomEmojiAfterBotDelivery({
      ...params,
      text: '✨ Offer',
      sources: [],
    });

    expect(mtprotoClient.editPostText).not.toHaveBeenCalled();
  });

  it('fails instead of silently publishing fallback emoji without a premium editor', async () => {
    const { service } = setup();

    await expect(
      service.restoreCustomEmojiAfterBotDelivery({ ...params, sources: [] }),
    ).rejects.toThrow('Premium Telegram account');
  });
});

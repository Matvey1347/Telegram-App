/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- focused service test doubles */
import { TelegramSystemBotChannelAccessService } from './telegram-system-bot-channel-access.service';

describe('TelegramSystemBotChannelAccessService layout', () => {
  it('packs channel choices into two columns', async () => {
    const channels = Array.from({ length: 5 }, (_, index) => ({
      id: `channel-${index}`,
      title: `Channel ${index}`,
      username: null,
      photoUrl: null,
      isActive: true,
      currentSubscribersCount: null,
    }));
    const prisma = {
      telegramChannel: { findMany: jest.fn().mockResolvedValue(channels) },
    } as any;
    const api = { sendMessage: jest.fn().mockResolvedValue({}) } as any;
    const service = new TelegramSystemBotChannelAccessService(
      prisma,
      api,
      { token: 'token' } as any,
      {} as any,
    );

    await service.list('44', 'workspace-1');

    const rows = api.sendMessage.mock.calls[0][1].reply_markup.inline_keyboard;
    expect(rows.map((row: unknown[]) => row.length)).toEqual([2, 2, 1]);
    expect(rows[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: 'channel:view:channel-0' }),
        expect.objectContaining({ callback_data: 'channel:view:channel-1' }),
      ]),
    );
  });
});

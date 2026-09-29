import { renderPublicationConfirmation } from './telegram-system-bot-publication-confirmation';

const channel = {
  id: 'channel-1', title: '💝 Листівки Привітання щодня 💝',
  presentationIcon: { emoji: '💌' },
  publicInviteLink: { url: 'https://t.me/public' },
  defaultInviteLink: { url: 'https://t.me/default' },
};

describe('renderPublicationConfirmation', () => {
  it('uses only the presentation emoji and renders a published post on its own line', () => {
    const text = renderPublicationConfirmation({
      state: 'published', channels: [channel], groups: [{ title: 'Тестовий пост', placements: [{
        telegramChannelId: channel.id, scheduledAt: '2026-09-29T15:10:00.000Z', deleteAt: '2026-10-01T15:10:00.000Z',
        telegramMessageUrls: ['https://t.me/c/1/2'],
      }] }],
    });
    expect(text).toContain('💌 <b>Листівки Привітання щодня</b>');
    expect(text).not.toContain('💝');
    expect(text).toContain('https://t.me/public');
    expect(text).toContain('</b>\n   <a href="https://t.me/c/1/2">Опублікований пост</a>');
    expect(text).toContain('через 48 год');
  });
});

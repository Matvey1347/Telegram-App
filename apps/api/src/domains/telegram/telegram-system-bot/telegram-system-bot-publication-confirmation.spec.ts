import { renderPublicationConfirmation } from './telegram-system-bot-publication-confirmation';

const channel = {
  id: 'channel-1',
  title: '💝 Листівки Привітання щодня 💝',
  presentationIcon: { emoji: '💌' },
  publicInviteLink: { url: 'https://t.me/public' },
  defaultInviteLink: { url: 'https://t.me/default' },
};

describe('renderPublicationConfirmation', () => {
  it('uses the confirmed publication time and compact shared delivery details', () => {
    const text = renderPublicationConfirmation({
      state: 'published',
      channels: [channel],
      groups: [
        {
          title: 'Тестовий пост',
          placements: [
            {
              telegramChannelId: channel.id,
              scheduledAt: '2026-09-29T15:10:00.000Z',
              publishedAt: '2026-09-29T16:10:00.000Z',
              deleteAt: '2026-10-01T16:10:00.000Z',
              telegramMessageUrls: ['https://t.me/c/1/2'],
            },
          ],
        },
      ],
      timezone: 'Europe/Kyiv',
    });
    expect(text).toContain('💌 <b>Листівки Привітання щодня</b>');
    expect(text).not.toContain('💝');
    expect(text).toContain('https://t.me/public');
    expect(text).toContain('📅 Дата — <b>29.09</b>; 🕒 Час — <b>19:10</b>\n🗑️ Формат — <b>Автовидалення через 48 годин</b>');
    expect(text.indexOf('Пост «Тестовий пост»')).toBeLessThan(text.indexOf('Дата —'));
    expect(text.indexOf('Формат —')).toBeLessThan(text.indexOf('Опубліковано в каналах:'));
    expect(text).toContain('<b>✅ Опубліковано в каналах:</b>');
    expect(text).toContain('📅 Дата — <b>29.09</b>; 🕒 Час — <b>19:10</b>');
    expect(text).toContain('🗑️ Формат — <b>Автовидалення через 48 годин</b>');
    expect(text).toContain('</a> — <a href="https://t.me/c/1/2">Пост</a>');
    expect(text).not.toContain('18:10');
    expect(text).toContain('через 48 год');
    expect(text).toContain('Часовий пояс: <b>Europe/Kyiv</b>');
  });

  it('formats the instant in the workspace timezone rather than Warsaw', () => {
    const text = renderPublicationConfirmation({
      state: 'scheduled',
      channels: [channel],
      timezone: 'America/New_York',
      groups: [
        {
          title: 'Тестовий пост',
          placements: [
            {
              telegramChannelId: channel.id,
              scheduledAt: '2026-01-15T15:10:00.000Z',
            },
          ],
        },
      ],
    });

    expect(text).toContain('📅 Дата — <b>15.01</b>; 🕒 Час — <b>10:10</b>');
    expect(text).toContain('Часовий пояс: <b>America/New_York</b>');
  });

  it('keeps each post heading before its shared date, time, and format', () => {
    const secondChannel = {
      ...channel,
      id: 'channel-2',
      title: 'Другий канал',
    };
    const shared = {
      scheduledAt: '2026-10-22T15:10:05.000Z',
      formatLabel: '2/48',
    };
    const text = renderPublicationConfirmation({
      state: 'scheduled',
      channels: [channel, secondChannel],
      timezone: 'Europe/Kyiv',
      groups: [
        {
          title: 'Перший пост',
          placements: [{ ...shared, telegramChannelId: channel.id }],
        },
        {
          title: 'Другий пост',
          placements: [{
            ...shared,
            scheduledAt: '2026-10-22T15:10:54.000Z',
            telegramChannelId: secondChannel.id,
          }],
        },
      ],
    });

    expect(text.match(/Дата —/g)).toHaveLength(2);
    expect(text.match(/Формат —/g)).toHaveLength(2);
    expect(text).toContain('📅 Дата — <b>22.10</b>; 🕒 Час — <b>18:10</b>\n🗑️ Формат — <b>2/48</b>');
    expect(text.indexOf('Пост «Перший пост»')).toBeLessThan(text.indexOf('Дата —'));
    expect(text.indexOf('Пост «Другий пост»')).toBeLessThan(text.lastIndexOf('Дата —'));
    expect(text).toContain('Другий пост');
  });
});

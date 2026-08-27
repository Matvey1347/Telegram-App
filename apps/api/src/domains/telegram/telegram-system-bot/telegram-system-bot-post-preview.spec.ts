import {
  TelegramSystemBotWorkflowKind,
  TelegramSystemBotWorkflowStatus,
} from '@prisma/client';
import { renderTelegramSystemBotAdSaleCard } from './telegram-system-bot-ad-sale-flow.presentation';
import { renderTelegramSystemBotPostCard } from './telegram-system-bot-post-flow.presentation';
import type { TelegramSystemBotCapturedPostContent } from './telegram-system-bot-post-flow.types';
import { telegramSystemBotPostPreview } from './telegram-system-bot-post-preview';

const fullText = [
  '**📊 СТАТИСТИКА**',
  '',
  'Назва бота: **[@Samorozvytok_pryvit_bot](https://t.me/Samorozvytok_pryvit_bot)**',
  '',
  '**За сьогодні:**',
  '▪️ Приріст: **123**',
  'Цей рядок має залишитися у повному превʼю після перших ста символів.',
].join('\n');
const finalLine = fullText.split('\n').at(-1)!;

const content: TelegramSystemBotCapturedPostContent = {
  text: fullText,
  imageUrls: [],
  buttonRows: [
    [{ text: 'Open', url: 'https://example.com', style: 'default' }],
  ],
  mediaGroupId: null,
  sourceTitle: 'Source',
  warnings: [],
};

function workflow(kind: TelegramSystemBotWorkflowKind, step: string) {
  return {
    id: 'workflow-1',
    connectionId: 'connection-1',
    workspaceId: 'workspace-1',
    kind,
    step,
    status: TelegramSystemBotWorkflowStatus.ACTIVE,
    version: 1,
    controlMessageId: 99,
    payload: {},
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never;
}

describe('System Bot managed-post preview', () => {
  it('renders the entire managed post as Telegram HTML with its URL buttons', () => {
    const preview = telegramSystemBotPostPreview(content);

    expect(preview.html).toContain('<b>📊 СТАТИСТИКА</b>');
    expect(preview.html).toContain(
      'Цей рядок має залишитися у повному превʼю після перших ста символів.',
    );
    expect(preview.html).not.toContain('**');
    expect(preview.buttonRows).toEqual([
      [{ text: 'Open', url: 'https://example.com' }],
    ]);
  });

  it('uses the formatted full preview in the post channel-selection card', () => {
    const card = renderTelegramSystemBotPostCard({
      workflow: workflow(
        TelegramSystemBotWorkflowKind.POST_IMPORT,
        'CHOOSE_CHANNEL',
      ),
      scope: {
        connectionId: 'connection-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        telegramUserId: 'telegram-user-1',
        chatId: 'chat-1',
        timezone: 'Europe/Warsaw',
      },
      payload: { content },
      channels: [{ id: 'channel-1', title: 'Channel' }],
    });

    if (!('parse_mode' in card)) throw new Error('Expected HTML preview');
    expect(card.parse_mode).toBe('HTML');
    expect(card.text).toContain(finalLine);
    expect(card.text).toContain('<b>📊 СТАТИСТИКА</b>');
    if (!('reply_markup' in card)) throw new Error('Expected post controls');
    expect(card.reply_markup.inline_keyboard[0]).toEqual([
      { text: 'Open', url: 'https://example.com' },
    ]);
  });

  it('renders the attached photo as a large Telegram media preview', () => {
    const card = renderTelegramSystemBotPostCard({
      workflow: workflow(
        TelegramSystemBotWorkflowKind.POST_IMPORT,
        'CHOOSE_CHANNEL',
      ),
      scope: {
        connectionId: 'connection-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        telegramUserId: 'telegram-user-1',
        chatId: 'chat-1',
        timezone: 'Europe/Warsaw',
      },
      payload: {
        content: { ...content, imageUrls: ['https://cdn.example/post.jpg'] },
      },
      channels: [{ id: 'channel-1', title: 'Channel' }],
    });

    expect(card.link_preview_options).toEqual({
      url: 'https://cdn.example/post.jpg',
      prefer_large_media: true,
      show_above_text: true,
    });
    expect(card.text).not.toContain('photo(s) attached');
  });

  it('uses the same full preview in the Ad Sale wizard', () => {
    const card = renderTelegramSystemBotAdSaleCard({
      workflow: workflow(
        TelegramSystemBotWorkflowKind.AD_SALE,
        'CHOOSE_PRODUCT',
      ),
      scope: {
        connectionId: 'connection-1',
        workspaceId: 'workspace-1',
        userId: 'user-1',
        telegramUserId: 'telegram-user-1',
        chatId: 'chat-1',
        timezone: 'Europe/Warsaw',
      },
      payload: { content },
      options: {
        currentMember: { id: 'member-1', name: 'Member' },
        accounts: [],
        members: [],
        channels: [],
        products: [],
      },
    });

    expect(card.parse_mode).toBe('HTML');
    expect(card.text).toContain('<b>📊 СТАТИСТИКА</b>');
    expect(card.text).toContain(finalLine);
    expect(card.reply_markup?.inline_keyboard[0]).toEqual([
      { text: 'Open', url: 'https://example.com' },
    ]);
  });
});

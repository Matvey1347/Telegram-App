import type { ResolvedEmoji } from '@telegram-system/shared';
import { createCollapsibleReplyKeyboard } from '../../../telegram/shared/telegram-reply-keyboard';
import { systemBotEmoji } from './telegram-system-bot-presentation';

const SYSTEM_BOT_ACTIONS: Readonly<Record<string, string>> = {
  Finance: '/finance',
  Posts: '/posts',
  'Ad Sale': '/adsale',
  Settings: '/settings',
  Workspace: '/settings',
  '💰 Finance': '/finance',
  '📝 Posts': '/posts',
  '💼 Ad Sale': '/adsale',
  '⚙️ Settings': '/settings',
};

export const SYSTEM_BOT_COMMANDS = [
  { command: 'start', description: 'Start or reconnect the System Bot' },
  { command: 'help', description: 'Show available commands' },
  { command: 'posts', description: 'Browse and create channel posts' },
  { command: 'post', description: 'Create a new channel post' },
  { command: 'adsale', description: 'Record an advertising sale' },
  { command: 'finance', description: 'Record income or expense' },
  { command: 'settings', description: 'Bot account and workspace settings' },
] as const;

export const SYSTEM_BOT_HELP_TEXT =
  '🤖 Use the square keyboard icon next to the message field. You can also type these commands:\n📝 /posts — browse and create channel posts\n➕ /post — directly create a new post\n💼 /adsale — quickly record an advertising sale\n💰 /finance — record income or expense\n⚙️ /settings — bot account and workspace settings';

export function systemBotCommandFor(text: string | undefined) {
  return text ? (SYSTEM_BOT_ACTIONS[text] ?? text) : undefined;
}

export function systemBotMenuPayload(workspace: {
  name: string;
  avatarPresentation?: ResolvedEmoji | null;
}) {
  return {
    text: `${systemBotEmoji(workspace.avatarPresentation, '🏢')} Workspace: ${workspace.name}`,
    reply_markup: createCollapsibleReplyKeyboard(
      [
        [{ text: '📝 Posts' }, { text: '💼 Ad Sale' }],
        [{ text: '💰 Finance' }, { text: '⚙️ Settings' }],
      ],
      { inputFieldPlaceholder: 'Choose an action or send a message' },
    ),
  };
}

export function formatSystemBotDate(
  value: string | Date | null | undefined,
  timezone: string,
  locale = 'en',
) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(
      locale === 'ru' ? 'ru-RU' : 'en-GB',
      options,
    ).format(date);
  }
}

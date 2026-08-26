import type { ResolvedEmoji } from '@telegram-system/shared';
import { createCollapsibleReplyKeyboard } from '../../../telegram/shared/telegram-reply-keyboard';
import { systemBotEmoji } from './telegram-system-bot-presentation';

const SYSTEM_BOT_ACTIONS: Readonly<Record<string, string>> = {
  Channels: '/channels',
  Statistics: '/stats',
  Finance: '/finance',
  Posts: '/posts',
  'Ad Sale': '/adsale',
  'Switch Workspace': '/workspace',
  '📢 Channels': '/channels',
  '📊 Statistics': '/stats',
  '💰 Finance': '/finance',
  '📝 Posts': '/posts',
  '💼 Ad Sale': '/adsale',
  '🏢 Switch Workspace': '/workspace',
};

export const SYSTEM_BOT_HELP_TEXT =
  '🤖 Use the square keyboard icon next to the message field. You can also type these commands:\n📝 /posts — browse and create channel posts\n➕ /post — directly create a new post\n💼 /adsale — quickly record an advertising sale\n📢 /channels — your managed channels\n📊 /stats — workspace statistics\n💰 /finance — record income or expense\n🏢 /workspace — switch workspace';

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
        [{ text: '📢 Channels' }, { text: '📊 Statistics' }],
        [{ text: '📝 Posts' }, { text: '💼 Ad Sale' }],
        [{ text: '💰 Finance' }, { text: '🏢 Switch Workspace' }],
      ],
      { inputFieldPlaceholder: 'Choose an action or send a message' },
    ),
  };
}

export function formatSystemBotDate(
  value: string | Date | null | undefined,
  timezone: string,
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
    return new Intl.DateTimeFormat('en-GB', {
      ...options,
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(date);
  }
}

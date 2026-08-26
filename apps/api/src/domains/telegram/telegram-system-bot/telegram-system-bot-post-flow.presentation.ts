import { TelegramSystemBotWorkflowStatus } from '@prisma/client';
import { compactSystemBotInlineKeyboard } from './telegram-system-bot-inline-keyboard';
import type {
  TelegramSystemBotPostFlowScope,
  TelegramSystemBotPostGroupOption,
  TelegramSystemBotPostPayload,
  TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import {
  escapeSystemBotHtml,
  telegramSystemBotPostPreview,
  type TelegramSystemBotCardButton,
} from './telegram-system-bot-post-preview';

type ChannelOption = { id: string; title: string };

export function renderTelegramSystemBotPostCard(input: {
  workflow: TelegramSystemBotPostWorkflow;
  scope: TelegramSystemBotPostFlowScope;
  payload: TelegramSystemBotPostPayload;
  channels?: ChannelOption[];
  groups?: TelegramSystemBotPostGroupOption[];
  notice?: string;
}) {
  const { workflow, scope, payload } = input;
  const prefix = `sbp:${workflow.id}:${workflow.version}:`;
  const preview = telegramSystemBotPostPreview(payload.content);
  const previewText = payload.content
    ? ['<b>Post preview</b>', preview.html, ...contentWarnings(payload)].join(
        '\n',
      )
    : '';

  if (workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED) {
    return {
      text: `✅ Post saved${workflow.resultManagedPostId ? `\nID: ${workflow.resultManagedPostId}` : ''}`,
    };
  }
  if (workflow.status === TelegramSystemBotWorkflowStatus.CANCELLED) {
    return { text: 'Cancelled.' };
  }
  if (workflow.status === TelegramSystemBotWorkflowStatus.FAILED) {
    return withNotice(input.notice, {
      text: `⚠️ Could not finish the post.${workflow.lastError ? `\n${escapeSystemBotHtml(workflow.lastError)}` : ''}`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '↻ Retry', callback_data: `${prefix}retry` }],
          [{ text: 'Cancel', callback_data: `${prefix}cancel` }],
        ],
      },
    });
  }
  if (workflow.step === 'AWAIT_CONTENT') {
    return withNotice(input.notice, {
      text: 'Forward a text or photo post here. URL buttons are preserved when Telegram includes them.',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Cancel', callback_data: `${prefix}cancel` }],
        ],
      },
    });
  }
  if (workflow.step === 'CHOOSE_CHANNEL') {
    return withNotice(input.notice, {
      text: [previewText, '', '<b>Choose a channel:</b>'].join('\n'),
      reply_markup: {
        inline_keyboard: [
          ...preview.buttonRows,
          ...compactSystemBotInlineKeyboard(
            (input.channels ?? []).map((channel, index) => ({
              text: channel.title,
              callback_data: `${prefix}channel.${index}`,
            })),
          ),
          navigationButtons(prefix),
        ],
      },
    });
  }
  if (workflow.step === 'CHOOSE_ACTION') {
    return withNotice(input.notice, {
      text: [
        previewText,
        '',
        `Channel: ${escapeSystemBotHtml(payload.channelTitle)}`,
        `Group: ${escapeSystemBotHtml(payload.groupTitle)}`,
        '',
        '<b>Choose an action:</b>',
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [
          ...preview.buttonRows,
          [
            { text: '✏️ Edit text', callback_data: `${prefix}edit.text` },
            {
              text: '🔗 Edit buttons',
              callback_data: `${prefix}edit.buttons`,
            },
          ],
          [
            {
              text: '📁 Change group',
              callback_data: `${prefix}group.change`,
            },
          ],
          [{ text: '📝 Save draft', callback_data: `${prefix}draft` }],
          [
            { text: '🕒 Schedule', callback_data: `${prefix}schedule` },
            { text: '🚀 Publish now', callback_data: `${prefix}publish` },
          ],
          navigationButtons(prefix),
        ],
      },
    });
  }
  if (workflow.step === 'CHOOSE_GROUP') {
    return withNotice(input.notice, {
      text: [
        previewText,
        '',
        `Channel: ${escapeSystemBotHtml(payload.channelTitle)}`,
        '',
        '<b>Choose a post group:</b>',
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [
          ...preview.buttonRows,
          ...compactSystemBotInlineKeyboard(
            (input.groups ?? []).map((group, index) => ({
              text: `${group.isDefault ? '★ ' : ''}${group.title}`,
              callback_data: `${prefix}group.${index}`,
            })),
            { limit: 100 },
          ),
          navigationButtons(prefix),
        ],
      },
    });
  }
  if (workflow.step === 'AWAIT_EDIT_TEXT') {
    return withNotice(input.notice, {
      text: `${previewText}\n\n<b>Send the replacement post text.</b>`,
      reply_markup: {
        inline_keyboard: [...preview.buttonRows, navigationButtons(prefix)],
      },
    });
  }
  if (workflow.step === 'AWAIT_EDIT_BUTTONS') {
    return withNotice(input.notice, {
      text: [
        previewText,
        '',
        'Send one URL button per line:',
        'Label | https://example.com',
        '',
        'Send - to remove all buttons.',
      ].join('\n'),
      reply_markup: {
        inline_keyboard: [...preview.buttonRows, navigationButtons(prefix)],
      },
    });
  }
  if (workflow.step === 'AWAIT_SCHEDULE') {
    return withNotice(input.notice, {
      text: `${previewText}\n\nSend publication time as DD.MM.YYYY HH:mm\nTimezone: ${escapeSystemBotHtml(scope.timezone)}`,
      reply_markup: {
        inline_keyboard: [...preview.buttonRows, navigationButtons(prefix)],
      },
    });
  }
  return withNotice(input.notice, {
    text: [
      previewText,
      '',
      `<b>Confirm post</b>`,
      `Channel: ${escapeSystemBotHtml(payload.channelTitle)}`,
      `Group: ${escapeSystemBotHtml(payload.groupTitle)}`,
      `Action: ${escapeSystemBotHtml(payload.action)}`,
      payload.scheduledAt
        ? `At: ${escapeSystemBotHtml(payload.scheduledAt)}`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
    reply_markup: {
      inline_keyboard: [
        ...preview.buttonRows,
        [{ text: '✅ Confirm', callback_data: `${prefix}confirm` }],
        navigationButtons(prefix),
      ],
    },
  });
}

function navigationButtons(prefix: string): TelegramSystemBotCardButton[] {
  return [
    { text: '← Back', callback_data: `${prefix}back` },
    { text: 'Cancel', callback_data: `${prefix}cancel` },
  ];
}

function contentWarnings(payload: TelegramSystemBotPostPayload) {
  const content = payload.content;
  if (!content) return [];
  return content.warnings.map(warningText);
}

function warningText(value: string) {
  if (value === 'UNSUPPORTED_BUTTONS_REMOVED')
    return '⚠️ Unsupported source buttons were removed.';
  if (value === 'INVALID_URL_BUTTONS_REMOVED')
    return '⚠️ Invalid URL buttons were removed.';
  if (value === 'NOT_FORWARDED')
    return 'ℹ️ Saved from a new message, not a forward.';
  return `⚠️ ${escapeSystemBotHtml(value)}`;
}

function withNotice<T extends { text: string }>(
  notice: string | undefined,
  card: T,
) {
  const formatted = { ...card, parse_mode: 'HTML' as const };
  return notice
    ? {
        ...formatted,
        text: `⚠️ ${escapeSystemBotHtml(notice)}\n\n${card.text}`,
      }
    : formatted;
}

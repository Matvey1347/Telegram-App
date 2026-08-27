import { TelegramSystemBotWorkflowStatus } from '@prisma/client';
import {
  compactSystemBotInlineKeyboard,
  systemBotReviewActionRow,
} from './telegram-system-bot-inline-keyboard';
import {
  TELEGRAM_BOT_ACTION_TEXT,
  telegramBotApiActionRow,
} from '../../../telegram/shared/telegram-bot-action-buttons';
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
  const present = <T extends { text: string }>(card: T) =>
    withNotice(input.notice, card, preview.imageUrl);
  const previewText = payload.content
    ? ['<b>Post preview</b>', preview.html, ...contentWarnings(payload)].join(
        '\n',
      )
    : '';

  if (workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED) {
    return {
      text:
        payload.destination === 'AD_SALE_MODAL'
          ? '✅ Post added to the Ad Sale form. Return to the website.'
          : `✅ Post saved${workflow.resultManagedPostId ? `\nID: ${workflow.resultManagedPostId}` : ''}`,
    };
  }
  if (workflow.status === TelegramSystemBotWorkflowStatus.CANCELLED) {
    return { text: 'Cancelled.' };
  }
  if (workflow.status === TelegramSystemBotWorkflowStatus.FAILED) {
    return present({
      text: `⚠️ Could not finish the post.${workflow.lastError ? `\n${escapeSystemBotHtml(workflow.lastError)}` : ''}`,
      reply_markup: {
        inline_keyboard: [
          [{ text: '↻ Retry', callback_data: `${prefix}retry` }],
          [
            {
              text: TELEGRAM_BOT_ACTION_TEXT.cancel,
              callback_data: `${prefix}cancel`,
            },
          ],
        ],
      },
    });
  }
  if (workflow.step === 'AWAIT_CONTENT') {
    return present({
      text: 'Forward a text or photo post here. URL buttons are preserved when Telegram includes them.',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: TELEGRAM_BOT_ACTION_TEXT.cancel,
              callback_data: `${prefix}cancel`,
            },
          ],
        ],
      },
    });
  }
  if (workflow.step === 'CHOOSE_CHANNEL') {
    return present({
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
    if (payload.destination === 'AD_SALE_MODAL') {
      return present({
        text: preview.html,
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
                text: TELEGRAM_BOT_ACTION_TEXT.cancel,
                callback_data: `${prefix}cancel`,
              },
              {
                text: '✅ Add to Ad Sale',
                callback_data: `${prefix}confirm`,
              },
            ],
          ],
        },
      });
    }
    return present({
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
  if (
    payload.destination === 'AD_SALE_MODAL' &&
    (workflow.step === 'AWAIT_EDIT_TEXT' ||
      workflow.step === 'AWAIT_EDIT_BUTTONS')
  ) {
    const editingButtons = workflow.step === 'AWAIT_EDIT_BUTTONS';
    return present({
      text: preview.html,
      reply_markup: {
        inline_keyboard: [
          ...preview.buttonRows,
          [
            {
              text: editingButtons
                ? 'Send: Label | https://example.com'
                : 'Send the replacement text',
              callback_data: `${prefix}noop`,
            },
          ],
          navigationButtons(prefix),
        ],
      },
    });
  }
  if (workflow.step === 'CHOOSE_GROUP') {
    return present({
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
    return present({
      text: `${previewText}\n\n<b>Send the replacement post text.</b>`,
      reply_markup: {
        inline_keyboard: [...preview.buttonRows, navigationButtons(prefix)],
      },
    });
  }
  if (workflow.step === 'AWAIT_EDIT_BUTTONS') {
    return present({
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
    return present({
      text: `${previewText}\n\nSend publication time as DD.MM.YYYY HH:mm\nTimezone: ${escapeSystemBotHtml(scope.timezone)}`,
      reply_markup: {
        inline_keyboard: [...preview.buttonRows, navigationButtons(prefix)],
      },
    });
  }
  return present({
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
        systemBotReviewActionRow(prefix),
      ],
    },
  });
}

function navigationButtons(prefix: string): TelegramSystemBotCardButton[] {
  return telegramBotApiActionRow({
    back: `${prefix}back`,
    cancel: `${prefix}cancel`,
  });
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
  imageUrl?: string | null,
) {
  const formatted = {
    ...card,
    parse_mode: 'HTML' as const,
    ...(imageUrl
      ? {
          link_preview_options: {
            url: imageUrl,
            prefer_large_media: true,
            show_above_text: true,
          },
        }
      : {}),
  };
  return notice
    ? {
        ...formatted,
        text: `⚠️ ${escapeSystemBotHtml(notice)}\n\n${card.text}`,
      }
    : formatted;
}

import { TelegramSystemBotWorkflowStatus } from '@prisma/client';
import {
  compactSystemBotInlineKeyboard,
  systemBotReviewActionRow,
} from './telegram-system-bot-inline-keyboard';
import {
  TELEGRAM_BOT_ACTION_TEXT,
  telegramBotApiActionRow,
} from '../../../telegram/shared/telegram-bot-action-buttons';
import {
  telegramSystemBotPostPayload,
  type TelegramSystemBotPostFlowScope,
  type TelegramSystemBotPostGroupOption,
  type TelegramSystemBotPostPayload,
  type TelegramSystemBotPostWorkflow,
} from './telegram-system-bot-post-flow.types';
import {
  escapeSystemBotHtml,
  telegramSystemBotPostPreview,
  type TelegramSystemBotCardButton,
} from './telegram-system-bot-post-preview';
import type { TelegramSystemBotPostFlowOptions } from './telegram-system-bot-post-flow.options';

type ChannelOption = { id: string; title: string };
type NetworkOption = { id: string; name: string; channelCount: number };

export async function resolveTelegramSystemBotPostCard(input: {
  workflow: TelegramSystemBotPostWorkflow;
  scope: TelegramSystemBotPostFlowScope;
  options: TelegramSystemBotPostFlowOptions;
  notice?: string;
}) {
  const payload = telegramSystemBotPostPayload(input.workflow.payload);
  const targetPicker = payload.targetPicker ?? 'CHANNELS';
  const channels =
    input.workflow.step === 'CHOOSE_CHANNEL' && targetPicker === 'CHANNELS'
      ? await input.options.channels(input.scope)
      : undefined;
  const networks =
    input.workflow.step === 'CHOOSE_CHANNEL' && targetPicker === 'NETWORKS'
      ? await input.options.networks?.(input.scope)
      : undefined;
  const groups =
    input.workflow.step === 'CHOOSE_GROUP' && payload.channelId
      ? await input.options.groups(input.scope, payload.channelId)
      : undefined;
  return renderTelegramSystemBotPostCard({
    workflow: input.workflow,
    scope: input.scope,
    payload,
    channels,
    networks,
    groups,
    notice: input.notice,
  });
}

export function renderTelegramSystemBotPostCard(input: {
  workflow: TelegramSystemBotPostWorkflow;
  scope: TelegramSystemBotPostFlowScope;
  payload: TelegramSystemBotPostPayload;
  channels?: ChannelOption[];
  networks?: NetworkOption[];
  groups?: TelegramSystemBotPostGroupOption[];
  notice?: string;
}) {
  const { workflow, scope, payload } = input;
  const targetPicker = payload.targetPicker ?? 'CHANNELS';
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
      text: `✅ Post saved${workflow.resultManagedPostId ? `\nID: ${workflow.resultManagedPostId}` : ''}`,
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
      text: 'Forward a text, photo, video or GIF post here. URL buttons are preserved when Telegram includes them.',
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
    const selectedIds = new Set(
      targetPicker === 'CHANNELS'
        ? (payload.selectedChannelIds ?? [])
        : (payload.selectedNetworkIds ?? []),
    );
    return present({
      text: [previewText, '', '<b>Choose where to publish:</b>'].join('\n'),
      reply_markup: {
        inline_keyboard: [
          ...preview.buttonRows,
          [
            {
              text: `${targetPicker === 'CHANNELS' ? '◉' : '○'} 📣 Channels`,
              callback_data: `${prefix}target.channels`,
            },
            {
              text: `${targetPicker === 'NETWORKS' ? '◉' : '○'} 🌐 Networks`,
              callback_data: `${prefix}target.networks`,
            },
          ],
          ...compactSystemBotInlineKeyboard(
            (input.channels ?? []).map((channel, index) => ({
              text: `${selectedIds.has(channel.id) ? '☑️' : '☐'} ${channel.title}`,
              callback_data: `${prefix}target.toggle.channel.${index}`,
            })),
          ),
          ...compactSystemBotInlineKeyboard(
            (input.networks ?? []).map((network, index) => ({
              text: `${selectedIds.has(network.id) ? '☑️' : '☐'} ${network.name} (${network.channelCount})`,
              callback_data: `${prefix}target.toggle.network.${index}`,
            })),
          ),
          ...(selectedIds.size
            ? [
                [
                  {
                    text: `Continue (${selectedIds.size})`,
                    callback_data: `${prefix}target.continue`,
                  },
                ],
              ]
            : []),
          navigationButtons(prefix),
        ],
      },
    });
  }
  if (workflow.step === 'CHOOSE_ACTION') {
    return present({
      text: [
        previewText,
        '',
        payload.targetLabel
          ? `Network: ${escapeSystemBotHtml(payload.targetLabel)}`
          : `Channel: ${escapeSystemBotHtml(payload.channelTitle)}`,
        payload.groupTitle
          ? `Group: ${escapeSystemBotHtml(payload.groupTitle)}`
          : null,
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
          ...(payload.channelIds?.length && payload.channelIds.length > 1
            ? []
            : [[{ text: '📝 Save draft', callback_data: `${prefix}draft` }]]),
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
      payload.targetLabel
        ? `Network: ${escapeSystemBotHtml(payload.targetLabel)}`
        : `Channel: ${escapeSystemBotHtml(payload.channelTitle)}`,
      payload.groupTitle
        ? `Group: ${escapeSystemBotHtml(payload.groupTitle)}`
        : null,
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

import { TelegramSystemBotWorkflowStatus } from '@prisma/client';
import { compactSystemBotInlineKeyboard } from './telegram-system-bot-inline-keyboard';
import { systemBotEmoji } from './telegram-system-bot-presentation';
import type {
  TelegramSystemBotAdSaleOptions,
  TelegramSystemBotAdSalePayload,
  TelegramSystemBotAdSaleScope,
  TelegramSystemBotAdSaleWorkflow,
} from './telegram-system-bot-ad-sale-flow.types';
import {
  escapeSystemBotHtml,
  telegramSystemBotPostPreview,
  type TelegramSystemBotCardButton,
} from './telegram-system-bot-post-preview';

type Button = TelegramSystemBotCardButton;
type Card = {
  text: string;
  parse_mode?: 'HTML';
  reply_markup?: { inline_keyboard: Button[][] };
};

export function renderTelegramSystemBotAdSaleCard(input: {
  workflow: TelegramSystemBotAdSaleWorkflow;
  scope: TelegramSystemBotAdSaleScope;
  payload: TelegramSystemBotAdSalePayload;
  options?: TelegramSystemBotAdSaleOptions;
  notice?: string;
}): Card {
  const { workflow, scope, payload } = input;
  const prefix = `sba:${workflow.id}:${workflow.version}:`;
  const terminal = terminalCard(workflow, prefix);
  if (terminal) return terminal;
  const options = input.options ?? {};
  const summary = adSaleSummary(payload);
  const navigation = [
    { text: '← Back', callback_data: `${prefix}back` },
    { text: 'Cancel', callback_data: `${prefix}cancel` },
  ];
  let card: Card;
  switch (workflow.step) {
    case 'CHOOSE_SALE_MODE':
      card = {
        text: '<b>Quick Ad Sale</b>\n\nWhat do you want to do?',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '➕ Create new advertising',
                callback_data: `${prefix}mode.new`,
              },
            ],
            [
              {
                text: '🔗 Attach post to existing advertising',
                callback_data: `${prefix}mode.existing`,
              },
            ],
            [{ text: 'Cancel', callback_data: `${prefix}cancel` }],
          ],
        },
      };
      break;
    case 'CHOOSE_EXISTING_PLACEMENT':
      card = choiceCard(
        '<b>Attach to existing advertising</b>\n\nChoose an available placement:',
        options.placements ?? [],
        prefix,
        'placement',
        navigation,
        (item) => item.label,
      );
      break;
    case 'CHOOSE_ACCOUNT':
      card = accountCard(summary, options, prefix, navigation);
      break;
    case 'CHOOSE_MEMBER':
      card = choiceCard(
        'Choose responsible member:',
        options.members ?? [],
        prefix,
        'member',
        navigation,
        (item) => item.name,
      );
      break;
    case 'CHOOSE_TARGET':
      card = targetCard(summary, payload, options, prefix, navigation);
      break;
    case 'AWAIT_AMOUNT':
      card = navCard(
        `${summary}\n\nSend sale amount in ${payload.finance?.currency}.`,
        navigation,
      );
      break;
    case 'CHOOSE_CONTENT':
      card = contentCard(summary, payload, prefix, navigation);
      break;
    case 'AWAIT_CONTENT':
      card = navCard(
        `${summary}\n\nSend or forward the ad text/photo. URL buttons are preserved when available.`,
        navigation,
      );
      break;
    case 'CHOOSE_EXISTING_POST':
      card = choiceCard(
        `${summary}\n\nChoose an existing managed post:`,
        options.managedPosts ?? [],
        prefix,
        'managedpost',
        navigation,
        (item) => `${item.title} · ${item.status}`,
      );
      break;
    case 'CHOOSE_FORMAT':
      card = formatCard(summary, payload, options, prefix, navigation);
      break;
    case 'AWAIT_EDIT_TEXT':
      card = navCard(`${summary}\n\nSend replacement post text.`, navigation);
      break;
    case 'AWAIT_EDIT_BUTTONS':
      card = navCard(
        `${summary}\n\nSend one button per line as Label | https://example.com\nSend - to clear buttons.`,
        navigation,
      );
      break;
    case 'CHOOSE_DELIVERY':
      card = deliveryCard(summary, prefix, navigation);
      break;
    case 'AWAIT_SCHEDULE':
      card = navCard(
        `${summary}\n\nSend planned date as DD.MM.YYYY HH:mm\nTimezone: ${scope.timezone}`,
        navigation,
      );
      break;
    default:
      card = confirmCard(summary, payload, prefix, navigation);
  }
  if (payload.content && card.reply_markup) {
    card = {
      ...card,
      reply_markup: {
        inline_keyboard: [
          ...telegramSystemBotPostPreview(payload.content).buttonRows,
          ...card.reply_markup.inline_keyboard,
        ],
      },
    };
  }
  card = { ...card, parse_mode: 'HTML' };
  return input.notice
    ? {
        ...card,
        text: `⚠️ ${escapeSystemBotHtml(input.notice)}\n\n${card.text}`,
      }
    : card;
}

function terminalCard(
  workflow: TelegramSystemBotAdSaleWorkflow,
  prefix: string,
): Card | null {
  if (workflow.status === TelegramSystemBotWorkflowStatus.COMPLETED) {
    return {
      text: [
        '✅ Ad Sale recorded',
        `Sale: ${workflow.resultAdSaleId}`,
        workflow.resultManagedPostId
          ? `Post: ${workflow.resultManagedPostId}`
          : 'Post: skipped',
      ].join('\n'),
    };
  }
  if (workflow.status === TelegramSystemBotWorkflowStatus.CANCELLED) {
    return { text: 'Ad Sale cancelled.' };
  }
  if (workflow.status === TelegramSystemBotWorkflowStatus.FAILED) {
    return {
      text: `⚠️ ${escapeSystemBotHtml(workflow.lastError ?? 'Ad Sale failed.')}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Retry', callback_data: `${prefix}retry` }],
          [{ text: 'Cancel', callback_data: `${prefix}cancel` }],
        ],
      },
    };
  }
  return null;
}

function accountCard(
  summary: string,
  options: TelegramSystemBotAdSaleOptions,
  prefix: string,
  navigation: Button[],
): Card {
  return {
    text: `${summary}\n\nFinance is optional. Choose an account or skip it:`,
    reply_markup: {
      inline_keyboard: [
        ...compactSystemBotInlineKeyboard(
          (options.accounts ?? []).map((item, index) => ({
            text: `${systemBotEmoji(item.iconPresentation, '💳')} ${item.name} (${item.currency})`,
            callback_data: `${prefix}account.${index}`,
          })),
        ),
        [{ text: '⏭ Skip finance', callback_data: `${prefix}finance.skip` }],
        [{ text: '👤 Change member', callback_data: `${prefix}member.change` }],
        navigation,
      ],
    },
  };
}

function targetCard(
  summary: string,
  payload: TelegramSystemBotAdSalePayload,
  options: TelegramSystemBotAdSaleOptions,
  prefix: string,
  navigation: Button[],
): Card {
  const selected = new Set(
    payload.target?.kind === 'CHANNELS' ? payload.target.channelIds : [],
  );
  const channels = compactSystemBotInlineKeyboard(
    (options.channels ?? []).map((item, index) => ({
      text: `${selected.has(item.id) ? '✓ ' : ''}${item.title}`,
      callback_data: `${prefix}target.channel.${index}`,
    })),
  );
  const networks = (options.networks ?? []).map((item, index) => [
    {
      text: `🌐 ${item.name} (${item.channelCount})`,
      callback_data: `${prefix}target.network.${index}`,
    },
  ]);
  return {
    text: `${summary}\n\nSelect one or more own channels, or choose one network:`,
    reply_markup: {
      inline_keyboard: [
        ...channels,
        ...(selected.size
          ? [
              [
                {
                  text: `Continue (${selected.size})`,
                  callback_data: `${prefix}target.continue`,
                },
              ],
            ]
          : []),
        ...networks,
        navigation,
      ],
    },
  };
}

function contentCard(
  summary: string,
  payload: TelegramSystemBotAdSalePayload,
  prefix: string,
  navigation: Button[],
): Card {
  const canSelectExisting =
    payload.mode === 'EXISTING' ||
    (payload.target?.kind === 'CHANNELS' &&
      payload.target.channelIds.length === 1);
  return {
    text: `${summary}\n\nChoose advertising post content:`,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Send / forward post',
            callback_data: `${prefix}content.send`,
          },
        ],
        ...(canSelectExisting
          ? [
              [
                {
                  text: '📚 Select existing post',
                  callback_data: `${prefix}content.existing`,
                },
              ],
            ]
          : []),
        ...(payload.mode === 'NEW'
          ? [[{ text: 'Skip post', callback_data: `${prefix}content.skip` }]]
          : []),
        navigation,
      ],
    },
  };
}

function formatCard(
  summary: string,
  payload: TelegramSystemBotAdSalePayload,
  options: TelegramSystemBotAdSaleOptions,
  prefix: string,
  navigation: Button[],
): Card {
  return {
    text: `${summary}\n\nChoose a format available for every selected channel:`,
    reply_markup: {
      inline_keyboard: [
        ...(payload.content
          ? [
              [
                {
                  text: '✏️ Edit text',
                  callback_data: `${prefix}content.edit_text`,
                },
                {
                  text: '🔗 Edit buttons',
                  callback_data: `${prefix}content.edit_buttons`,
                },
              ],
            ]
          : []),
        ...compactSystemBotInlineKeyboard(
          (options.formats ?? []).map((item, index) => ({
            text: item.name,
            callback_data: `${prefix}format.${index}`,
          })),
          { columns: 3 },
        ),
        navigation,
      ],
    },
  };
}

function deliveryCard(
  summary: string,
  prefix: string,
  navigation: Button[],
): Card {
  return {
    text: `${summary}\n\nWhat should happen with the post?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Save draft', callback_data: `${prefix}delivery.draft` }],
        [
          { text: '🕒 Schedule', callback_data: `${prefix}delivery.schedule` },
          {
            text: '🚀 Publish now',
            callback_data: `${prefix}delivery.publish`,
          },
        ],
        navigation,
      ],
    },
  };
}

function confirmCard(
  summary: string,
  payload: TelegramSystemBotAdSalePayload,
  prefix: string,
  navigation: Button[],
): Card {
  return {
    text: `${summary}\n\nConfirm ${payload.mode === 'EXISTING' ? 'post attachment' : 'advertising creation'}?`,
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Confirm', callback_data: `${prefix}confirm` }],
        navigation,
      ],
    },
  };
}

function choiceCard<T>(
  title: string,
  items: T[],
  prefix: string,
  kind: string,
  navigation: Button[],
  label: (item: T) => string,
): Card {
  return {
    text: title,
    reply_markup: {
      inline_keyboard: [
        ...compactSystemBotInlineKeyboard(
          items.map((item, index) => ({
            text: label(item),
            callback_data: `${prefix}${kind}.${index}`,
          })),
        ),
        navigation,
      ],
    },
  };
}

function navCard(text: string, navigation: Button[]): Card {
  return { text, reply_markup: { inline_keyboard: [navigation] } };
}

function adSaleSummary(payload: TelegramSystemBotAdSalePayload) {
  const target =
    payload.target?.kind === 'NETWORK'
      ? `Network: ${escapeSystemBotHtml(payload.target.label)}`
      : payload.target?.kind === 'CHANNELS'
        ? `Channels: ${payload.target.labels.map(escapeSystemBotHtml).join(', ')}`
        : null;
  const details = [
    '<b>Quick Ad Sale</b>',
    payload.mode === 'EXISTING' ? 'Mode: attach to existing advertising' : null,
    payload.existingSaleLabel
      ? `Sale: ${escapeSystemBotHtml(payload.existingSaleLabel)}`
      : null,
    payload.existingChannelLabel
      ? `Channel: ${escapeSystemBotHtml(payload.existingChannelLabel)}`
      : null,
    payload.finance
      ? `Account: ${escapeSystemBotHtml(payload.finance.accountLabel)}`
      : payload.financeSkipped
        ? 'Finance: skipped'
        : null,
    payload.memberLabel
      ? `Member: ${escapeSystemBotHtml(payload.memberLabel)}`
      : null,
    target,
    payload.finance?.amount
      ? `Amount: ${payload.finance.amount} ${payload.finance.currency}`
      : null,
    payload.existingManagedPostLabel
      ? `Post: ${escapeSystemBotHtml(payload.existingManagedPostLabel)}`
      : payload.skipPost
        ? 'Post: skipped'
        : null,
    payload.formatName
      ? `Format: ${payload.formatName}`
      : payload.existingFormatLabel
        ? `Format: ${escapeSystemBotHtml(payload.existingFormatLabel)}`
        : null,
    payload.deliveryAction ? `Delivery: ${payload.deliveryAction}` : null,
    payload.scheduledAt
      ? `Planned: ${escapeSystemBotHtml(payload.scheduledAt)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
  return payload.content
    ? `${details}\n\n<b>Post preview</b>\n${telegramSystemBotPostPreview(payload.content).html}`
    : details;
}

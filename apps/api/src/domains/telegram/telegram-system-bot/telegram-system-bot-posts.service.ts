import { Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TelegramManagedPostStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { formatSystemBotDate } from './telegram-system-bot-menu';
import type { TelegramSystemBotPostFlowScope } from './telegram-system-bot-post-flow.types';
import { TelegramSystemBotPostFlowOptions } from './telegram-system-bot-post-flow.options';
import { resolveTelegramSystemBotAdSaleTargets } from './telegram-system-bot-ad-sale-flow.options';
import { translateSystemBotPosts as t } from './i18n/posts';

type CalendarPickerMode = 'CHANNELS' | 'NETWORKS';

@Injectable()
export class TelegramSystemBotPostsService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly options: TelegramSystemBotPostFlowOptions,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('posts:'));
  }

  open(scope: TelegramSystemBotPostFlowScope) {
    return this.render(scope, this.homeCard(scope.locale));
  }

  async callback(
    scope: TelegramSystemBotPostFlowScope,
    callback: string,
    controlMessageId: number | undefined,
  ) {
    if (callback === 'posts:home') {
      return this.render(scope, this.homeCard(scope.locale), controlMessageId);
    }
    if (callback === 'posts:calendar') {
      return this.renderCalendarPicker(scope, controlMessageId);
    }
    if (callback === 'posts:calendar:channels') {
      return this.renderCalendarPicker(scope, controlMessageId, 'CHANNELS');
    }
    if (callback === 'posts:calendar:networks') {
      return this.renderCalendarPicker(scope, controlMessageId, 'NETWORKS');
    }
    if (callback.startsWith('posts:calendar:select:')) {
      const mask = Number(callback.slice('posts:calendar:select:'.length));
      return this.renderCalendarPicker(
        scope,
        controlMessageId,
        'CHANNELS',
        mask,
      );
    }
    if (callback === 'posts:noop') return null;
    if (callback.startsWith('posts:calendar:network:')) {
      return this.renderNetworkCalendarPicker(
        scope,
        Number(callback.slice('posts:calendar:network:'.length)),
        controlMessageId,
      );
    }
    if (callback.startsWith('posts:calendar:channel:')) {
      const [channelId, month] = callback
        .slice('posts:calendar:channel:'.length)
        .split(':');
      return this.renderCalendar(scope, channelId, controlMessageId, month);
    }
    if (callback.startsWith('posts:calendar:')) {
      const [index, month] = callback
        .slice('posts:calendar:'.length)
        .split(':');
      const channel = (await this.options.channels(scope))[Number(index)];
      if (!channel)
        throw new NotFoundException('Channel is no longer available');
      return this.renderCalendar(scope, channel.id, controlMessageId, month);
    }
    if (callback.startsWith('posts:day:')) {
      const [channelId, date] = callback.slice('posts:day:'.length).split(':');
      return this.renderCalendar(
        scope,
        channelId,
        controlMessageId,
        date.slice(0, 7),
        date,
      );
    }
    return this.render(scope, this.homeCard(scope.locale), controlMessageId);
  }

  private homeCard(locale: string | undefined) {
    return {
      text: t(locale, 'title'),
      reply_markup: {
        inline_keyboard: [
          [{ text: t(locale, 'addNew'), callback_data: 'posts:add' }],
          [{ text: '🗓 Content plan', callback_data: 'posts:calendar' }],
        ],
      },
    };
  }

  private async renderCalendarPicker(
    scope: TelegramSystemBotPostFlowScope,
    controlMessageId?: number,
    mode: CalendarPickerMode = 'CHANNELS',
    selectedMask = 0,
  ) {
    const channels =
      mode === 'CHANNELS' ? await this.options.channels(scope) : [];
    const networks =
      mode === 'NETWORKS' ? await this.options.networks(scope) : [];
    return this.render(
      scope,
      {
        text: '<b>Content plan</b>\n\nChoose channels or a network to view its calendar.',
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `${mode === 'CHANNELS' ? '◉' : '○'} 📣 Channels`,
                callback_data: 'posts:calendar:channels',
              },
              {
                text: `${mode === 'NETWORKS' ? '◉' : '○'} 🌐 Networks`,
                callback_data: 'posts:calendar:networks',
              },
            ],
            ...channels.map((channel, index) => [
              {
                text: `${selectedMask & (1 << index) ? '☑️' : '☐'} ${channel.title}`,
                callback_data: `posts:calendar:select:${selectedMask ^ (1 << index)}`,
              },
            ]),
            ...(selectedMask
              ? [
                  [
                    {
                      text: `🗓 View ${channels.filter((_, index) => selectedMask & (1 << index)).length} channel(s)`,
                      callback_data: `posts:calendar:channel:m${selectedMask}`,
                    },
                  ],
                ]
              : []),
            ...networks.map((network, index) => [
              {
                text: `🌐 ${network.name} (${network.channelCount})`,
                callback_data: `posts:calendar:network:${index}`,
              },
            ]),
            [{ text: t(scope.locale, 'back'), callback_data: 'posts:home' }],
          ],
        },
      },
      controlMessageId,
    );
  }

  private async renderNetworkCalendarPicker(
    scope: TelegramSystemBotPostFlowScope,
    networkIndex: number,
    controlMessageId?: number,
  ) {
    const networks = await this.options.networks(scope);
    const network = networks[networkIndex];
    if (!network) throw new NotFoundException('Network is no longer available');
    const targets = await resolveTelegramSystemBotAdSaleTargets(
      this.moduleRef,
      scope.workspaceId,
    );
    const target = await targets.resolve(scope.userId, {
      kind: 'NETWORK',
      networkId: network.id,
    });
    const ids = new Set(target.channelIds);
    const availableChannels = await this.options.channels(scope);
    const channels = availableChannels.filter((channel) => ids.has(channel.id));
    if (!channels.length)
      throw new NotFoundException(
        'No active channels are available in network',
      );
    const mask = availableChannels.reduce(
      (value, channel, index) => value | (ids.has(channel.id) ? 1 << index : 0),
      0,
    );
    return this.renderCalendar(
      scope,
      channels.length === 1 ? channels[0].id : `m${mask}`,
      controlMessageId,
    );
  }

  private async renderCalendar(
    scope: TelegramSystemBotPostFlowScope,
    channelId: string,
    controlMessageId?: number,
    monthValue?: string,
    selectedDate?: string,
  ) {
    const availableChannels = await this.options.channels(scope);
    const mask = /^m\d+$/.test(channelId) ? Number(channelId.slice(1)) : null;
    const selectedChannels =
      mask === null
        ? availableChannels.filter((channel) => channel.id === channelId)
        : availableChannels.filter((_, index) => Boolean(mask & (1 << index)));
    if (!selectedChannels.length)
      throw new NotFoundException('Channel is no longer available');
    const channelIds = selectedChannels.map((channel) => channel.id);
    const date = /^\d{4}-\d{2}$/.test(monthValue ?? '')
      ? new Date(`${monthValue}-01T00:00:00.000Z`)
      : new Date();
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    // Include the UTC edges neighbouring the local calendar month. A post close
    // to midnight must be shown on its calendar date in the workspace timezone.
    const from = new Date(Date.UTC(year, month, 1) - 86_400_000);
    const until = new Date(Date.UTC(year, month + 1, 1) + 86_400_000);
    // The authorization check and compact monthly read are independent, so run
    // them together. Calendar navigation still costs one bounded DB read.
    const posts = await this.prisma.telegramManagedPost.findMany({
      where: {
        workspaceId: scope.workspaceId,
        telegramChannelId:
          channelIds.length === 1 ? channelIds[0] : { in: channelIds },
        status: {
          in: [
            TelegramManagedPostStatus.SCHEDULED,
            TelegramManagedPostStatus.PUBLISHED,
          ],
        },
        OR: [
          { scheduledAt: { gte: from, lt: until } },
          { publishedAt: { gte: from, lt: until } },
        ],
      },
      select: {
        id: true,
        telegramChannelId: true,
        title: true,
        status: true,
        scheduledAt: true,
        publishedAt: true,
        deleteAfterHours: true,
        plannerFormat: { select: { name: true } },
      },
    });
    const channel = selectedChannels[0];
    const channelTitleById = new Map(
      selectedChannels.map((item) => [item.id, item.title]),
    );
    const postsByDay = new Map<string, typeof posts>();
    for (const post of posts) {
      const day = localCalendarDate(
        post.scheduledAt ?? post.publishedAt!,
        scope.timezone,
      );
      const entries = postsByDay.get(day) ?? [];
      entries.push(post);
      postsByDay.set(day, entries);
    }
    const selectedPosts = selectedDate
      ? (postsByDay.get(selectedDate) ?? [])
      : [];
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const today = localCalendarDate(new Date(), scope.timezone);
    const leadingEmptyDays =
      (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const dayButtons = Array.from({ length: leadingEmptyDays }, () => ({
      text: ' ',
      callback_data: 'posts:noop',
    }));
    dayButtons.push(
      ...Array.from({ length: daysInMonth }, (_, offset) => {
        const postDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(offset + 1).padStart(2, '0')}`;
        const dayPosts = postsByDay.get(postDate) ?? [];
        const marker =
          selectedDate === postDate
            ? '🔵 '
            : dayPosts.some(
                  (post) => post.status === TelegramManagedPostStatus.SCHEDULED,
                )
              ? '🟡 '
              : dayPosts.length
                ? '🟢 '
                : postDate === today
                  ? '📍 '
                  : '';
        return {
          text: `${marker}${offset + 1}`,
          callback_data: `posts:day:${channelId}:${postDate}`,
        };
      }),
    );
    const weeks = Array.from(
      { length: Math.ceil(dayButtons.length / 7) },
      (_, row) => dayButtons.slice(row * 7, row * 7 + 7),
    );
    const previous = new Date(Date.UTC(year, month - 1, 1))
      .toISOString()
      .slice(0, 7);
    const next = new Date(Date.UTC(year, month + 1, 1))
      .toISOString()
      .slice(0, 7);
    return this.render(
      scope,
      {
        text: [
          `<b>${escapeHtml(selectedChannels.length === 1 ? channel.title : `${selectedChannels.length} channels`)} · ${monthName(month, scope.locale)} ${year}</b>`,
          `📍 today · 🟡 scheduled · 🟢 published · 🔵 selected · ${postsByDay.size} day(s) with posts`,
          selectedDate
            ? selectedPosts.length
              ? [
                  `<b>${selectedDate}</b>`,
                  ...selectedPosts.map(
                    (post) =>
                      `${selectedChannels.length > 1 ? `<b>${escapeHtml(channelTitleById.get(post.telegramChannelId) ?? '')}</b> · ` : ''}${calendarPostSummary(post, scope)}`,
                  ),
                ].join('\n')
              : `<b>${selectedDate}</b>\nNo posts planned for this day.`
            : 'Choose a day to view its publications.',
        ].join('\n\n'),
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((text) => ({
              text,
              callback_data: 'posts:noop',
            })),
            ...weeks,
            ...(selectedPosts.length
              ? selectedPosts.map((post) => [
                  {
                    text: `✏️ Edit: ${post.title.slice(0, 32)}`,
                    callback_data: `posts:edit:${availableChannels.findIndex((item) => item.id === post.telegramChannelId)}:${post.id}`,
                  },
                ])
              : []),
            [
              {
                text: '‹',
                callback_data: `posts:calendar:channel:${channelId}:${previous}`,
              },
              {
                text: '›',
                callback_data: `posts:calendar:channel:${channelId}:${next}`,
              },
            ],
            [
              {
                text: t(scope.locale, 'back'),
                callback_data: 'posts:calendar',
              },
            ],
          ],
        },
      },
      controlMessageId,
    );
  }

  private async render(
    scope: TelegramSystemBotPostFlowScope,
    card: {
      text: string;
      parse_mode?: 'HTML';
      reply_markup: {
        inline_keyboard: Array<
          Array<{ text: string; callback_data?: string; url?: string }>
        >;
      };
    },
    controlMessageId?: number,
  ) {
    if (controlMessageId) {
      try {
        return await this.api.editMessageText(this.config.token!, {
          chat_id: scope.chatId,
          message_id: controlMessageId,
          ...card,
        });
      } catch {
        // The callback card may have been deleted; send its replacement below.
      }
    }
    return this.api.sendMessage(this.config.token!, {
      chat_id: scope.chatId,
      ...card,
    });
  }
}

function monthName(month: number, locale?: string) {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    month: 'long',
  }).format(new Date(Date.UTC(2026, month, 1)));
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>]/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!,
  );
}

function localCalendarDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function calendarPostSummary(
  post: {
    title: string;
    status: TelegramManagedPostStatus;
    scheduledAt: Date | null;
    publishedAt: Date | null;
    deleteAfterHours: number | null;
    plannerFormat: { name: string } | null;
  },
  scope: TelegramSystemBotPostFlowScope,
) {
  const state =
    post.status === TelegramManagedPostStatus.PUBLISHED
      ? '✅ Published'
      : '🕒 Scheduled';
  const removeAfter = post.deleteAfterHours
    ? ` · Remove: ${post.deleteAfterHours / 24}/24`
    : '';
  const format = post.plannerFormat?.name
    ? ` · ${escapeHtml(post.plannerFormat.name)}`
    : '';
  return `${state} · ${escapeHtml(post.title)}\n${formatSystemBotDate(post.publishedAt ?? post.scheduledAt, scope.timezone, scope.locale)}${format}${removeAfter}`;
}

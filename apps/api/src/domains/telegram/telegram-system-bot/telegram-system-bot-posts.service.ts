import { Injectable, NotFoundException } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { TelegramManagedPostStatus } from '@prisma/client';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../telegram/shared/telegram-bot-api.client';
import { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { formatSystemBotDate } from './telegram-system-bot-menu';
import type { TelegramSystemBotPostFlowScope } from './telegram-system-bot-post-flow.types';

type PostsView = 'PUBLISHED' | 'SCHEDULED';

type ManagedPostListItem = {
  id: string;
  title: string;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  scheduleMode: string | null;
  telegramChannel: { title: string };
};

@Injectable()
export class TelegramSystemBotPostsService {
  constructor(
    private readonly config: TelegramSystemBotConfigService,
    private readonly api: TelegramBotApiClient,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  isCallback(value: string | undefined) {
    return Boolean(value?.startsWith('posts:'));
  }

  open(scope: TelegramSystemBotPostFlowScope) {
    return this.render(scope, this.homeCard());
  }

  async callback(
    scope: TelegramSystemBotPostFlowScope,
    callback: string,
    controlMessageId: number | undefined,
  ) {
    if (callback === 'posts:home') {
      return this.render(scope, this.homeCard(), controlMessageId);
    }
    if (callback === 'posts:published') {
      return this.renderList(scope, 'PUBLISHED', controlMessageId);
    }
    if (callback === 'posts:scheduled') {
      return this.renderList(scope, 'SCHEDULED', controlMessageId);
    }
    if (callback.startsWith('posts:publish:')) {
      return this.publishNow(
        scope,
        callback.slice('posts:publish:'.length),
        controlMessageId,
      );
    }
    return this.render(scope, this.homeCard(), controlMessageId);
  }

  private async publishNow(
    scope: TelegramSystemBotPostFlowScope,
    postId: string,
    controlMessageId: number | undefined,
  ) {
    try {
      const post = await this.prisma.telegramManagedPost.findFirst({
        where: {
          id: postId,
          ...this.workspaceWhere(scope, TelegramManagedPostStatus.SCHEDULED),
        },
        select: { id: true, telegramChannelId: true },
      });
      if (!post) throw new NotFoundException('Scheduled post is unavailable');
      const publication = await this.resolvePublication(scope.workspaceId);
      await publication.publishManagedPostNow(
        scope.userId,
        post.telegramChannelId,
        post.id,
        {},
      );
      return this.renderList(
        scope,
        'SCHEDULED',
        controlMessageId,
        '✅ Post published.',
      );
    } catch (error) {
      return this.renderList(
        scope,
        'SCHEDULED',
        controlMessageId,
        `⚠️ ${sanitizeOperationalError(error)}`,
      );
    }
  }

  private async renderList(
    scope: TelegramSystemBotPostFlowScope,
    view: PostsView,
    controlMessageId: number | undefined,
    notice?: string,
  ) {
    const posts = await this.posts(scope, view);
    return this.render(
      scope,
      this.listCard(view, posts, scope.timezone, notice),
      controlMessageId,
    );
  }

  private posts(scope: TelegramSystemBotPostFlowScope, view: PostsView) {
    const status = TelegramManagedPostStatus[view];
    return this.prisma.telegramManagedPost.findMany({
      where: this.workspaceWhere(scope, status),
      orderBy:
        view === 'SCHEDULED'
          ? [{ scheduledAt: 'asc' as const }, { createdAt: 'desc' as const }]
          : [{ publishedAt: 'desc' as const }, { createdAt: 'desc' as const }],
      take: 8,
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        publishedAt: true,
        scheduleMode: true,
        telegramChannel: { select: { title: true } },
      },
    });
  }

  private workspaceWhere(
    scope: TelegramSystemBotPostFlowScope,
    status: TelegramManagedPostStatus,
  ) {
    return {
      workspaceId: scope.workspaceId,
      status,
    };
  }

  private resolvePublication(workspaceId: string) {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(
      { headers: { 'x-workspace-id': workspaceId } },
      contextId,
    );
    return this.moduleRef.resolve(
      TelegramManagedPostPublicationService,
      contextId,
      { strict: false },
    );
  }

  private homeCard() {
    return {
      text: '📝 Posts',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Add new', callback_data: 'posts:new' }],
          [
            { text: '✅ Published', callback_data: 'posts:published' },
            { text: '🕒 Scheduled', callback_data: 'posts:scheduled' },
          ],
        ],
      },
    };
  }

  private listCard(
    view: PostsView,
    posts: ManagedPostListItem[],
    timezone: string,
    notice?: string,
  ) {
    const scheduled = view === 'SCHEDULED';
    const title = scheduled ? '🕒 Scheduled posts' : '✅ Published posts';
    const lines = posts.map((post, index) => {
      const at = scheduled ? post.scheduledAt : post.publishedAt;
      const source = scheduled
        ? ` · ${post.scheduleMode === 'TELEGRAM_NATIVE' ? 'Telegram/MTProto' : 'System Bot'}`
        : '';
      return `${index + 1}. ${post.title}\n${post.telegramChannel.title} · ${formatSystemBotDate(at, timezone)}${source}`;
    });
    return {
      text: [notice, title, lines.join('\n\n') || 'No posts.']
        .filter(Boolean)
        .join('\n\n'),
      reply_markup: {
        inline_keyboard: [
          ...(scheduled
            ? posts.map((post) => [
                {
                  text: `▶️ ${post.title.slice(0, 40)}`,
                  callback_data: `posts:publish:${post.id}`,
                },
              ])
            : []),
          [{ text: '← Posts', callback_data: 'posts:home' }],
        ],
      },
    };
  }

  private async render(
    scope: TelegramSystemBotPostFlowScope,
    card: {
      text: string;
      reply_markup: {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
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

import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { productionRecoveryConfig } from '../../../config/production-recovery-config';
import { rescheduleContext } from '../../../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.remote';
import { telegramAccountCredentials } from './telegram-account-credentials';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Credentials = { apiId: string; apiHash: string; session: string };
const digest = (value: Credentials) =>
  createHash('sha256')
    .update(JSON.stringify([value.apiId, value.apiHash, value.session]))
    .digest('hex');

/** Development-only transport: business logic and claims remain in localhost. */
@Injectable()
export class ProductionRecoveryMtprotoRelay {
  private readonly config = productionRecoveryConfig();
  private accounts?: Promise<Map<string, string>>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  private async accountId(credentials: Credentials) {
    this.accounts ??= (async () => {
      const links = await this.prisma.telegramChannelAdminLink.findMany({
        where: {
          workspaceId: this.config.workspaceId,
          telegramChannelId: this.config.channelId,
        },
        include: { telegramUserAccountIntegration: true },
      });
      const accounts = new Map<string, string>();
      for (const { telegramUserAccountIntegration: account } of links) {
        if (
          account.workspaceId !== this.config.workspaceId ||
          !account.isActive ||
          account.status !== 'connected'
        )
          continue;
        try {
          accounts.set(
            digest(telegramAccountCredentials(this.encryption, account)),
            account.id,
          );
        } catch {
          /* An unreadable account cannot authorize a transport request. */
        }
      }
      return accounts;
    })();
    const accountId = (await this.accounts).get(digest(credentials));
    if (!accountId)
      throw new Error('Account is outside the configured recovery channel');
    return accountId;
  }

  private async request<T>(
    operation: string,
    params: Credentials,
    body: Record<string, unknown> = {},
    mutation = false,
    signal?: AbortSignal,
  ): Promise<T> {
    const context = rescheduleContext.getStore();
    const request: Record<string, unknown> = {
      operation,
      accountId: await this.accountId(params),
      ...body,
    };
    if (mutation) {
      if (!context)
        throw new Error('Native mutations require an active reschedule claim');
      const post = await this.prisma.telegramManagedPost.findFirst({
        where: {
          workspaceId: this.config.workspaceId,
          telegramChannelId: this.config.channelId,
          deliveryClaimOwner: context.owner,
          deliveryClaimExpiresAt: { gt: new Date() },
          status: 'SCHEDULED',
        },
        select: { id: true, scheduledAt: true },
      });
      if (!post) throw new Error('Recovery claim is no longer active');
      Object.assign(request, {
        postId: post.id,
        claimOwner: context.owner,
        scheduleAt: post.scheduledAt?.toISOString(),
      });
    }
    const response = await fetch(
      `${this.config.productionApiOrigin}/telegram-channels/${this.config.channelId}/recovery-transport`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.productionApiToken}`,
          'x-workspace-id': this.config.workspaceId,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.any([
          AbortSignal.timeout(75_000),
          ...(signal || context?.signal ? [signal ?? context!.signal] : []),
        ]),
      },
    );
    // Never replay a failed request: a lost acknowledgement is an uncertain send.
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      const safe =
        typeof error.message === 'string' &&
        /^[A-Za-z0-9 .,;:()_'/-]{1,250}$/.test(error.message)
          ? error.message
          : 'Telegram recovery transport request failed';
      throw new Error(`${safe} (HTTP ${response.status})`);
    }
    return ((await response.json()) as { result: T }).result;
  }

  getScheduledHistory(
    params: Parameters<TelegramMtprotoClient['getScheduledHistory']>[0],
  ) {
    return this.request<
      Awaited<ReturnType<TelegramMtprotoClient['getScheduledHistory']>>
    >('scheduled', params);
  }
  getManagedPostMessages(
    params: Parameters<TelegramMtprotoClient['getManagedPostMessages']>[0],
  ) {
    if (params.publishedMessageIds.length || params.scheduledMessageIds.length)
      throw new Error('Recovery relay permits bounded history only');
    return this.request<
      Awaited<ReturnType<TelegramMtprotoClient['getManagedPostMessages']>>
    >('history', params, {
      historyFrom: params.recentPublishedFrom?.toISOString(),
      historyUntil: params.recentPublishedUntil?.toISOString(),
    });
  }
  getAccountProfile(
    params: Parameters<TelegramMtprotoClient['getAccountProfile']>[0],
  ) {
    return this.request<
      Awaited<ReturnType<TelegramMtprotoClient['getAccountProfile']>>
    >('profile', params);
  }
  deleteScheduledPost(
    params: Parameters<TelegramMtprotoClient['deleteScheduledPost']>[0],
  ) {
    return this.request<void>(
      'delete',
      params,
      { messageIds: params.messageIds },
      true,
    );
  }
  publishPost(params: Parameters<TelegramMtprotoClient['publishPost']>[0]) {
    if (!params.scheduleAt)
      throw new Error('Local recovery only permits future native schedules');
    const {
      html,
      textHtmlParts,
      captionHtml,
      followupHtmlParts,
      imageUrls,
      mediaItems,
    } = params;
    return this.request<string[]>(
      params.replacement ? 'replace' : 'publish',
      params,
      {
        ...(params.replacement
          ? { messageIds: params.replacement.messageIds }
          : {}),
        data: {
          html,
          textHtmlParts,
          captionHtml,
          followupHtmlParts,
          imageUrls,
          mediaItems,
        },
      },
      true,
      params.signal,
    );
  }
}

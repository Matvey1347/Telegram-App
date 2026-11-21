import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { productionRecoveryConfig } from '../../../config/production-recovery-config';
import { rescheduleContext } from '../../../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.remote';
import {
  recoveryAccountMarker,
  recoveryAuthorization,
} from './production-recovery-relay-context';
import { relayOperatorSend } from './production-operator-send-relay';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Credentials = { apiId: string; apiHash: string; session: string };
/** Development-only transport: business logic and claims remain in localhost. */
@Injectable()
export class ProductionRecoveryMtprotoRelay {
  private readonly config = productionRecoveryConfig();
  constructor(private readonly prisma: PrismaService) {}

  private async request<T>(
    operation: string,
    params: Credentials,
    body: Record<string, unknown> = {},
    mutation = false,
    signal?: AbortSignal,
  ): Promise<T> {
    const context = rescheduleContext.getStore();
    const authorization = recoveryAuthorization.getStore();
    if (
      !authorization ||
      params.apiHash !== recoveryAccountMarker ||
      params.apiId !== '0' ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(params.session)
    ) {
      throw new Error(
        'Recovery relay requires an admitted operator and linked account ID',
      );
    }
    const request: Record<string, unknown> = {
      operation,
      accountId: params.session,
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
        redirect: 'error',
        headers: {
          authorization,
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
    if (params.requireDeletionAccess) throw new Error('Interactive cancellation requires the deployed Telegram owner.');
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
    const {
      html,
      textHtmlParts,
      captionHtml,
      followupHtmlParts,
      imageUrls,
      mediaItems,
    } = params;
    if (!params.scheduleAt) {
      if (params.apiHash !== recoveryAccountMarker)
        throw new Error('An admitted MTProto actor is required');
      return relayOperatorSend<string[]>(params.session, 'mtproto', {
        html, textHtmlParts, captionHtml, followupHtmlParts, imageUrls, mediaItems,
        channelId: this.config.channelId,
      });
    }
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

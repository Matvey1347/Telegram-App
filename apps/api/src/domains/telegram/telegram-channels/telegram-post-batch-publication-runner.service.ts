import { Injectable } from '@nestjs/common';
import {
  TelegramManagedPostStatus,
  TelegramPostBatchDeliveryStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import { requiresNativeTelegramRichMessage } from '../../../telegram/shared/telegram-markup';
import {
  managedPostRequiresBotApi,
  selectManagedPostPublishingSource,
} from './managed-post-publishing-source';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramManagedPostReconciliationService } from './telegram-managed-post-reconciliation.service';
import { TelegramPostBatchClaimLeaseService } from './telegram-post-batch-claim-lease.service';
import { postBatchSourceCapabilityFailure } from './telegram-post-batch-source-policy';
import type { ClaimedPostBatchDelivery } from './telegram-post-batch-lifecycle.utils';

export class AmbiguousPostBatchPublicationError extends Error {}

@Injectable()
export class TelegramPostBatchPublicationRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly sourceAccess: TelegramSourceAccessService,
    private readonly lease: TelegramPostBatchClaimLeaseService,
    private readonly reconciliation: TelegramManagedPostReconciliationService,
  ) {}

  async run(
    delivery: ClaimedPostBatchDelivery,
    sourceCache: Map<
      string,
      ReturnType<TelegramSourceAccessService['sourcesForChannel']>
    >,
  ) {
    return this.lease.runWithClaims(
      [delivery],
      TelegramPostBatchDeliveryStatus.PUBLISHING,
      async () => {
        const recovered = await this.recoverExpiredClaim(delivery);
        if (recovered) return recovered;

        const sourceKey = `${delivery.workspaceId}:${delivery.telegramChannelId}`;
        let sourcePromise = sourceCache.get(sourceKey);
        if (!sourcePromise) {
          sourcePromise = this.sourceAccess.sourcesForChannel(
            delivery.workspaceId,
            delivery.telegramChannelId,
          );
          sourceCache.set(sourceKey, sourcePromise);
        }
        const sources = await sourcePromise;
        const requiresBotApi = managedPostRequiresBotApi({
          hasInlineButtons: Boolean(
            normalizeTelegramPostButtonRows(delivery.managedPost.buttonRows)
              .length,
          ),
          requiresRichMessage: requiresNativeTelegramRichMessage(
            delivery.managedPost.text ?? '',
          ),
          isAdvertisingPost: false,
          existingSourceType: delivery.managedPost.sourceType,
          hasExistingPublication: false,
        });
        const failure = postBatchSourceCapabilityFailure({
          deleteAfterHours: delivery.deleteAfterHours,
          requiresPublishing: true,
          requiresBotApi,
          sources,
        });
        if (failure) throw new Error(failure);
        const source = selectManagedPostPublishingSource(sources, {
          requiresBotApi,
        });
        if (!source) throw new Error('No connected publishing source');

        const marked = await this.prisma.telegramManagedPost.updateMany({
          where: {
            id: delivery.managedPostId,
            workspaceId: delivery.workspaceId,
            scheduleMode: 'BATCH',
            status: { in: ['SCHEDULED', 'FAILED'] },
          },
          data: {
            status: 'PUBLISHING',
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            lastError: 'POST_BATCH_REMOTE_SIDE_EFFECT_PENDING',
          },
        });
        if (marked.count !== 1) {
          const current = await this.published(delivery);
          if (current?.status === TelegramManagedPostStatus.PUBLISHED)
            return current;
          throw new Error('Managed post is no longer publishable');
        }
        await this.publication.publishBatchManagedPost(
          delivery.workspaceId,
          delivery.telegramChannelId,
          delivery.managedPostId,
          delivery.longTextMode === 'CAPTION_THEN_TEXT'
            ? 'CAPTION_THEN_TEXT'
            : 'IMAGES_THEN_TEXT',
        );
        return this.published(delivery);
      },
    );
  }

  private async recoverExpiredClaim(delivery: ClaimedPostBatchDelivery) {
    const managed = delivery.managedPost;
    if (
      delivery.attemptCount <= 1 ||
      !['PUBLISHING', 'FAILED'].includes(managed.status) ||
      managed.lastError !== 'POST_BATCH_REMOTE_SIDE_EFFECT_PENDING'
    ) {
      return null;
    }
    if (
      managed.sourceType === TelegramSourceType.BOT &&
      managed.telegramMessageIds.length
    ) {
      return null;
    }
    if (managed.sourceType !== TelegramSourceType.MTPROTO) {
      throw new AmbiguousPostBatchPublicationError(
        'Telegram may have accepted this Bot API publication before its delivery journal was persisted. Manual reconciliation is required; the post was not resent.',
      );
    }
    await this.reconciliation.reconcileManagedPostIdentities({
      workspaceId: delivery.workspaceId,
      channelId: delivery.telegramChannelId,
      postId: delivery.managedPostId,
      explicit: true,
    });
    const recovered = await this.published(delivery);
    if (recovered?.status === TelegramManagedPostStatus.PUBLISHED)
      return recovered;
    throw new AmbiguousPostBatchPublicationError(
      'Telegram may have accepted this MTProto publication, but its remote identity could not be recovered safely. Manual reconciliation is required; the post was not resent.',
    );
  }

  private published(delivery: ClaimedPostBatchDelivery) {
    return this.prisma.telegramManagedPost.findFirst({
      where: {
        id: delivery.managedPostId,
        workspaceId: delivery.workspaceId,
      },
      select: { publishedAt: true, status: true },
    });
  }
}

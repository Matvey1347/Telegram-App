import { TelegramManagedPostDeliveryAlertsService } from './telegram-managed-post-delivery-alerts.service';
import { managedPostDeliveryEligibility } from './managed-post-delivery-eligibility';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { TelegramManagedPostSendJournalService } from './telegram-managed-post-send-journal.service';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { managedPostDeliveryContext } from './telegram-managed-post-delivery-context';

export class ManagedPostDeliveryBlockedError extends Error {}

type Post = { id: string; workspaceId: string; telegramChannelId: string };
const DEADLINE_MS = 30_000;

/** Durable ownership belongs to each post, never to a whole batch of channels. */
@Injectable()
export class TelegramManagedPostDeliveryDispatcherService {
  private readonly logger = new Logger(
    TelegramManagedPostDeliveryDispatcherService.name,
  );
  constructor(
    private readonly prisma: PrismaService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly journal: TelegramManagedPostSendJournalService,
    private readonly moduleRef: ModuleRef,
    private readonly alerts?: TelegramManagedPostDeliveryAlertsService,
  ) {}

  async dispatch(post: Post) {
    const admission = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.claimAndStart(post, admission.signal),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => {
            admission.abort();
            resolve(false);
          }, 5_000);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async claimAndStart(post: Post, admission: AbortSignal) {
    const disposition = await this.journal.summarise(
      post.id,
      post.workspaceId,
      post.telegramChannelId,
    );
    admission.throwIfAborted();
    if (disposition.state === 'BLOCKED')
      throw new ManagedPostDeliveryBlockedError(
        'Telegram permanently rejected this publication; correct channel access or content',
      );
    const owner = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.telegramManagedPost.updateMany({
      where: {
        id: post.id,
        workspaceId: post.workspaceId,
        telegramChannelId: post.telegramChannelId,
        scheduledAt: { lte: now },
        status: { in: ['DRAFT', 'SCHEDULED', 'FAILED', 'PUBLISHING'] },
        AND: [
          managedPostDeliveryEligibility(now),
          {
            OR: [
              { status: { not: 'DRAFT' } },
              { mutualPromotionDelivery: { isNot: null } },
            ],
          },
          {
            OR: [
              { deliveryNextAttemptAt: null },
              { deliveryNextAttemptAt: { lte: now } },
            ],
          },
        ],
        OR: [
          { deliveryClaimExpiresAt: null },
          { deliveryClaimExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: 'PUBLISHING',
        scheduleMode: 'LOCAL',
        deliveryClaimOwner: owner,
        deliveryClaimExpiresAt: new Date(now.getTime() + DEADLINE_MS),
        deliveryAttemptCount: { increment: 1 },
      },
    });
    // Admission has no remote side effects. A late database result must never
    // launch a send after the caller has moved on to other deadlines.
    admission.throwIfAborted();
    if (claimed.count !== 1) return false;
    // The deadline fences future remote operations. An operation already sent
    // remains STARTED/UNKNOWN in the durable journal and is NEVER blindly retried.
    void this.run(post, owner).catch(() =>
      this.logger.error(
        'Publication recovery persistence failed; durable claim will recover on expiry',
      ),
    );
    return true;
  }

  private async run(post: Post, owner: string) {
    const controller = new AbortController();
    const execute = async () => {
      const outcome = await this.journal.summarise(
        post.id,
        post.workspaceId,
        post.telegramChannelId,
      );
      if (outcome.state === 'UNKNOWN') {
        const reconciliation = await this.moduleRef.resolve<{
          reconcileManagedPostIdentities(params: {
            workspaceId: string;
            channelId: string;
            postId: string;
            explicit: boolean;
          }): Promise<unknown>;
        }>('managed-post-reconciler', undefined, { strict: false });
        await reconciliation.reconcileManagedPostIdentities({
          workspaceId: post.workspaceId,
          channelId: post.telegramChannelId,
          postId: post.id,
          explicit: true,
        });
        const recovered = await this.prisma.telegramManagedPost.findFirst({
          where: { id: post.id, workspaceId: post.workspaceId },
          select: { status: true },
        });
        if (recovered?.status === 'PUBLISHED') return;
        throw new Error(
          'Telegram outcome is uncertain; checking remote history before any resend',
        );
      }
      if (outcome.state === 'BLOCKED')
        throw new Error(
          'Telegram rejected publication; channel access or content needs correction',
        );
      await managedPostDeliveryContext.run(
        { postId: post.id, owner, signal: controller.signal },
        () =>
          this.publication.publishManagedPost(
            post.workspaceId,
            post.telegramChannelId,
            post.id,
          ),
      );
    };
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        execute(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new Error(
                'Publication deadline exceeded; remote outcome requires reconciliation',
              ),
            );
          }, DEADLINE_MS);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      const outcome = await this.journal.summarise(
        post.id,
        post.workspaceId,
        post.telegramChannelId,
      );
      const current = await this.prisma.telegramManagedPost.findFirst({
        where: { id: post.id, workspaceId: post.workspaceId },
        select: { deliveryAttemptCount: true },
      });
      const backoff = Math.min(
        15 * 60_000,
        30_000 *
          2 **
            Math.min(5, Math.max(0, (current?.deliveryAttemptCount ?? 1) - 1)),
      );
      const retryAt =
        outcome.state === 'BLOCKED'
          ? null
          : (outcome.retryAt ??
            new Date(
              Date.now() + (outcome.state === 'UNKNOWN' ? 5 * 60_000 : backoff),
            ));
      await this.prisma.telegramManagedPost.updateMany({
        where: {
          id: post.id,
          workspaceId: post.workspaceId,
          deliveryClaimOwner: owner,
          status: { not: 'PUBLISHED' },
        },
        data: {
          status: 'FAILED',
          lastError:
            error instanceof Error ? error.message : 'Publication failed',
          deliveryNextAttemptAt: retryAt,
        },
      });
      const alertState =
        outcome.state === 'UNKNOWN' || outcome.state === 'BLOCKED'
          ? outcome.state
          : 'RETRY';
      void this.alerts
        ?.notify(post, alertState)
        .catch(() =>
          this.logger.warn(
            'Publication failure notification could not be delivered',
          ),
        );
    } finally {
      if (timer) clearTimeout(timer);
      await this.prisma.telegramManagedPost.updateMany({
        where: { id: post.id, deliveryClaimOwner: owner },
        data: { deliveryClaimOwner: null, deliveryClaimExpiresAt: null },
      });
      notifyScheduledTaskDueWorkChanged('telegram.managed_posts.reconcile_due');
      notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    }
  }
}

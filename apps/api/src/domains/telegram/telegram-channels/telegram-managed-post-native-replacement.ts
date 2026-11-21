import { managedPostDeliveryContext } from './telegram-managed-post-delivery-context';
import { randomUUID } from 'node:crypto';
import { telegramPostsBadRequest } from './telegram-posts.errors';
import type { Prisma, TelegramManagedPost } from '@prisma/client';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { nativeScheduleContentMatches, ordinaryScheduledPostWhere } from './telegram-managed-post-rescheduler-repair';
import {
  assertRescheduleActive,
  rescheduleContext,
} from './telegram-managed-post-rescheduler.remote';
import type { TelegramManagedPostNativeRecoveryStore } from './telegram-managed-post-native-recovery.store';

/** One claimed replacement generation; accepted IDs survive projection failure. */
export async function publishNativeReplacement(input: {
  prisma: PrismaService;
  mtproto: TelegramMtprotoClient;
  store: TelegramManagedPostNativeRecoveryStore;
  post: TelegramManagedPost;
  sourceId: string;
  params: Parameters<TelegramMtprotoClient['publishPost']>[0];
  onCancel: () => void;
}) {
  const context = rescheduleContext.getStore();
  if (
    !context ||
    (context.replacementFor !== input.post.id &&
      context.confirmedMissingScheduleFor !== input.post.id) ||
    !input.params.scheduleAt
  )
    throw new Error(
      'Native replacement requires the exact active recovery claim',
    );
  const identity = {
    postId: input.post.id,
    workspaceId: input.post.workspaceId,
    channelId: input.post.telegramChannelId,
    owner: context.owner,
  };
  await input.store.prepare({
    ...identity,
    sourceId: input.sourceId,
    scheduledAt: input.params.scheduleAt,
    ...(context.ordinaryReplacement ? { previousScheduledAt: input.post.scheduledAt, previousSourceId: input.post.sourceId } : {}),
    oldMessageIds: input.post.telegramScheduledMessageIds,
  });
  const ids = await input.mtproto.publishPost({
    ...input.params,
    beforeSend:
      context.replacementFor !== input.post.id
        ? async () => {
            await input.store.start(identity);
          }
        : undefined,
    replacement:
      context.replacementFor === input.post.id
        ? {
            messageIds: input.post.telegramScheduledMessageIds,
            requireCancellationAcknowledgement: context.ordinaryReplacement,
            previousScheduledAt: context.ordinaryReplacement ? input.post.scheduledAt! : undefined,
            validate: (messages) => {
              if (!nativeScheduleContentMatches(input.post, messages) ||
                (context.ordinaryReplacement && (!input.post.scheduledAt ||
                  messages.some((message) => !message.date ||
                    Math.floor(new Date(message.date).getTime() / 1000) !==
                    Math.floor(input.post.scheduledAt!.getTime() / 1000)))))
                throw new Error(
                  'Scheduled post identity changed; no schedule was cancelled',
                );
            },
            beforeChange: async () => {
              await assertRescheduleActive(input.prisma, input.post.id);
              const previous = context.ordinaryReplacement
                ? { scheduledAt: input.post.scheduledAt!, updatedAt: input.post.updatedAt, sourceId: input.sourceId }
                : undefined;
              if (previous) await input.store.start(identity, previous);
              else await input.store.start(identity);
              input.onCancel();
            },
            afterCancel: () => input.store.cancelled(identity),
          }
        : undefined,
  });
  await input.store.acknowledged({ ...identity, newMessageIds: ids });
  await assertRescheduleActive(input.prisma, input.post.id);
  return ids;
}

/** A failed response never becomes proof that a newly accepted schedule is absent. */
export async function retainNativeReplacementFailure(input: {
  prisma: PrismaService;
  store: TelegramManagedPostNativeRecoveryStore;
  postId: string;
  workspaceId: string;
  channelId: string;
}) {
  const context = rescheduleContext.getStore();
  if (
    !context ||
    (context.replacementFor !== input.postId &&
      context.confirmedMissingScheduleFor !== input.postId)
  )
    return false;
  const identity = { ...input, owner: context.owner };
  try {
    await input.store.failed(identity);
  } catch {
    /* Never clear evidence after a persistence failure. */
  }
  await input.prisma.telegramManagedPost.updateMany({
    where: {
      id: input.postId,
      workspaceId: input.workspaceId,
      telegramChannelId: input.channelId,
      status: 'SCHEDULED',
      deliveryClaimOwner: context.owner,
    },
    data: {
      telegramRemoteStatus: 'UNKNOWN',
      lastError:
        'Native schedule recreation did not complete. Reconcile the saved replacement evidence and Telegram queue before retrying.',
    },
  });
  return true;
}

/** Recover a saved acknowledgement after a lost response/projection, without sending. */
export async function recoverAcknowledgedNativeReplacement(input: {
  prisma: PrismaService;
  post: TelegramManagedPost;
  owner: string;
  snapshots: Array<Parameters<typeof nativeScheduleContentMatches>[1]>;
}) {
  const receipt =
    await input.prisma.telegramManagedPostNativeRecovery.findFirst({
      where: {
        postId: input.post.id,
        workspaceId: input.post.workspaceId,
        channelId: input.post.telegramChannelId,
      },
    });
  if (!receipt || receipt.status !== 'ACKED') return false;
  if (
    receipt.sourceId === input.post.sourceId &&
    input.post.scheduledAt?.getTime() === receipt.scheduledAt.getTime() &&
    JSON.stringify(receipt.newMessageIds) ===
      JSON.stringify(input.post.telegramScheduledMessageIds)
  )
    return false;
  const projected = {
    ...input.post,
    telegramScheduledMessageIds: receipt.newMessageIds,
  };
  const confirmed = input.snapshots.some((snapshot) => {
    if (!nativeScheduleContentMatches(projected, snapshot)) return false;
    const byId = new Map(snapshot!.map((message) => [message.id, message]));
    return (
      receipt.newMessageIds.length > 0 &&
      receipt.newMessageIds.every((id) => {
        const date = byId.get(id)?.date;
        return (
          date &&
          Math.floor(new Date(date).getTime() / 1000) ===
            Math.floor(receipt.scheduledAt.getTime() / 1000)
        );
      })
    );
  });
  if (!confirmed)
    throw new Error(
      'Saved native acknowledgement is not confirmed in Telegram; no replacement sent',
    );
  const result = await input.prisma.telegramManagedPost.updateMany({
    where: {
      id: input.post.id,
      workspaceId: input.post.workspaceId,
      telegramChannelId: input.post.telegramChannelId,
      status: 'SCHEDULED',
      scheduledAt: input.post.scheduledAt,
      deliveryClaimOwner: input.owner,
      deliveryClaimExpiresAt: { gt: new Date() },
    },
    data: {
      scheduledAt: receipt.scheduledAt,
      telegramScheduledMessageIds: receipt.newMessageIds,
      sourceId: receipt.sourceId,
      sourceType: 'MTPROTO',
      scheduleMode: 'TELEGRAM_NATIVE',
      telegramRemoteStatus: 'SCHEDULED',
      telegramMessageIds: [],
      telegramMessageUrls: [],
      publishedAt: null,
      telegramIdVerificationStatus: 'UNVERIFIED',
      lastError: null,
    },
  });
  if (result.count !== 1)
    throw new Error(
      'Recovery claim changed before native acknowledgement projection',
    );
  return true;
}

/** Shared native publication branch; replacement never opens the obsolete sender. */
export async function publishNativeManagedPost(
  input: Parameters<typeof publishNativeReplacement>[0],
) {
  if (
    rescheduleContext.getStore()?.replacementFor === input.post.id ||
    rescheduleContext.getStore()?.confirmedMissingScheduleFor === input.post.id
  )
    return publishNativeReplacement(input);
  if (input.post.status === 'SCHEDULED' && input.post.telegramScheduledMessageIds.length)
    throw new Error('Existing native schedule requires protected replacement');
  await assertRescheduleActive(input.prisma, input.post.id);
  return input.mtproto.publishPost(input.params);
}

export async function rethrowNativeReplacementFailure(
  input: Parameters<typeof retainNativeReplacementFailure>[0],
) {
  if (await retainNativeReplacementFailure(input))
    throw telegramPostsBadRequest(
      'TELEGRAM_POST_PUBLISH_FAILED',
      'Native schedule recreation did not complete; reconcile the saved evidence before retrying.',
    );
}

/** Fence projection with the same live claim that admitted native replacement. */
export function managedPostPublicationProjectionWhere(
  post: Pick<TelegramManagedPost, 'id' | 'workspaceId' | 'telegramChannelId'>,
): Prisma.TelegramManagedPostWhereUniqueInput {
  const context = rescheduleContext.getStore();
  const delivery = managedPostDeliveryContext.getStore();
  return {
    id: post.id,
    workspaceId: post.workspaceId,
    telegramChannelId: post.telegramChannelId,
    ...(context
      ? {
          status: 'SCHEDULED',
          deliveryClaimOwner: context.owner,
          deliveryClaimExpiresAt: { gt: new Date() },
        }
      : delivery?.owner.startsWith('operator:') ? {
          status: 'PUBLISHING', deliveryClaimOwner: delivery.owner,
          deliveryClaimExpiresAt: { gt: new Date() },
        } : {}),
  };
}

export async function withOrdinaryNativeReplacement<T>(input: {
  prisma: PrismaService;
  post: TelegramManagedPost;
  telegramChatId: string | null;
  scheduleAt?: Date;
  publish: (scheduleAt: Date) => Promise<T>;
}) {
  const { prisma, post, scheduleAt, telegramChatId } = input;
  if (!scheduleAt || scheduleAt <= new Date() || !post.scheduledAt ||
      post.scheduledAt <= new Date() || post.sourceType !== 'MTPROTO' ||
      !post.sourceId || !post.telegramScheduledMessageIds.length ||
      post.origin !== 'SYSTEM' || post.telegramLinkSource !== 'AUTO' ||
      post.remoteImportKey || !telegramChatId)
    throw telegramPostsBadRequest('TELEGRAM_POST_NOT_SCHEDULED', 'Existing native schedule requires reconciliation');
  const owner = `reschedule:${randomUUID()}`;
  const scope = { id: post.id, workspaceId: post.workspaceId, telegramChannelId: post.telegramChannelId };
  const admitted = await prisma.telegramManagedPost.updateMany({
    where: {
      ...ordinaryScheduledPostWhere(post.workspaceId, post.telegramChannelId),
      ...scope, updatedAt: post.updatedAt,
      deliveryClaimOwner: null, sendOperations: { none: {} },
      OR: [
        { nativeRecovery: { is: null } },
        { nativeRecovery: { is: { status: { in: ['ACKED', 'PREPARED', 'REJECTED'] } } } },
      ],
    },
    data: { deliveryClaimOwner: owner, deliveryClaimExpiresAt: new Date(Date.now() + 120_000) },
  });
  if (admitted.count !== 1) throw new Error('The native schedule changed or is already claimed');
  let projected = false;
  try {
    const result = await rescheduleContext.run(
      { owner, scheduledAt: scheduleAt, replacementFor: post.id,
        ordinaryReplacement: true, signal: AbortSignal.timeout(60_000) },
      () => input.publish(scheduleAt),
    );
    projected = true;
    return result;
  } finally {
    await prisma.telegramManagedPost.updateMany({
      where: {
        ...scope, deliveryClaimOwner: owner,
        ...(projected ? {} : {
          OR: [
            { nativeRecovery: { is: null } },
            { nativeRecovery: { is: { owner: { not: owner } } } },
            { nativeRecovery: { is: { status: { in: ['PREPARED', 'REJECTED'] } } } },
          ],
        }),
      },
      data: { deliveryClaimOwner: null, deliveryClaimExpiresAt: null },
    }).catch(() => undefined); // A failed cleanup must retain the evidence and original operation outcome.
  }
}

import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import {
  normalizeManagedPostMarkup,
  normalizeTelegramPlainText,
} from './telegram-managed-post-identity-text';
import type { RescheduleChannelScheduledPostProgress } from '@telegram-system/shared';
import type { Prisma, TelegramManagedPost } from '@prisma/client';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TelegramManagedPostIdentityService } from './telegram-managed-post-identity.service';
import type { ReschedulerAccountContext } from './telegram-managed-post-rescheduler.remote';

/** A missing future queue entry is repairable only with affirmative sender evidence. */
export async function assertMissingNativeScheduleRepairable(input: {
  prisma: PrismaService;
  identity: TelegramManagedPostIdentityService;
  post: TelegramManagedPost;
  context: ReschedulerAccountContext | undefined;
  workspaceId: string;
  channelId: string;
  history:
    | Awaited<ReturnType<TelegramMtprotoClient['getManagedPostMessages']>>
    | undefined;
}) {
  const { post, context } = input;
  if (!post.sourceId || !context || context.error || !context.scheduledMessages)
    throw new Error(
      'Original sender complete scheduled queue is unavailable; no replacement sent.',
    );
  if (
    post.telegramScheduledMessageIds.some((id) => context.scheduledIds.has(id))
  )
    throw new Error(
      'Only part of this post remains scheduled in Telegram; reconcile the partial schedule before retrying.',
    );
  // Older native rows mirrored scheduled IDs into telegramMessageIds. Those
  // IDs are not evidence in the published channel message namespace.
  const actualMessageIds = post.telegramMessageIds.filter(
    (id) => !post.telegramScheduledMessageIds.includes(id),
  );
  const operations = await input.prisma.telegramManagedPostSendOperation.count({
    where: {
      postId: post.id,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
    },
  });
  if (
    operations ||
    post.deliveryAttemptCount ||
    post.publishedAt ||
    post.telegramRemoteStatus === 'PUBLISHED' ||
    actualMessageIds.length
  )
    throw new Error(
      'Post has delivery evidence; reconcile the send journal or publication before restoring its schedule.',
    );
  const expected = input.identity.normalizedPlainText(post.text || '');
  const matchingContent = (message: { text: string; hasMedia: boolean }) => {
    const visible = normalizeTelegramPlainText(message.text || '');
    // Include partial text: a previous multipart schedule may have survived
    // with new IDs. Ambiguous content is a reason to inspect, never to replay.
    return expected && visible
      ? expected.includes(visible) || visible.includes(expected)
      : !expected && message.hasMedia;
  };
  if (!input.history?.recentPublishedComplete)
    throw new Error(
      'Published history is incomplete; cannot exclude an early Telegram publication.',
    );
  if (input.history.recentPublished.some(matchingContent))
    throw new Error(
      'Matching content is already published in Telegram; reconcile its identity before restoring a schedule.',
    );
  if (context.scheduledMessages.some(matchingContent))
    throw new Error(
      'Telegram contains a matching unlinked scheduled message; reconcile its identity before creating a replacement.',
    );
}

/** Fetch publication evidence for overdue posts and absent future native entries. */
export function historyCandidatesForReschedule(
  posts: TelegramManagedPost[],
  contexts: Map<string, ReschedulerAccountContext>,
  now: Date,
) {
  return posts.filter(
    (post) =>
      !post.scheduledAt ||
      post.scheduledAt <= now ||
      (post.scheduleMode !== 'LOCAL' &&
        !preservedScheduleStage(
          post,
          contexts.get(post.sourceId ?? ''),
          false,
        ) &&
        post.telegramScheduledMessageIds.some(
          (id) => !contexts.get(post.sourceId ?? '')?.scheduledIds.has(id),
        )),
  );
}

/** Reject both rows when corrupt local identities alias the same remote queue ID. */
export function overlappingNativeSchedules(
  posts: Array<
    Pick<
      TelegramManagedPost,
      'id' | 'scheduleMode' | 'telegramScheduledMessageIds'
    >
  >,
) {
  const ownerByRemoteId = new Map<string, string>();
  const overlapping = new Set<string>();
  for (const post of posts) {
    if (post.scheduleMode === 'LOCAL') continue;
    for (const id of new Set(post.telegramScheduledMessageIds)) {
      const owner = ownerByRemoteId.get(id);
      if (owner && owner !== post.id) {
        overlapping.add(owner);
        overlapping.add(post.id);
      }
      ownerByRemoteId.set(id, post.id);
    }
  }
  return overlapping;
}

/** Re-read only scoped compact outcomes when a stream retry has stale IDs. */
export async function requestedRescheduleOutcomes(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  posts: Array<{ id: string }>,
  requestedIds?: string[],
): Promise<RescheduleChannelScheduledPostProgress[]> {
  const eligible = new Set(posts.map((post) => post.id));
  const excluded = (requestedIds ?? []).filter((id) => !eligible.has(id));
  if (!excluded.length) return [];
  const current = await prisma.telegramManagedPost.findMany({
    where: {
      workspaceId,
      telegramChannelId: channelId,
      id: { in: excluded },
      postBatchDelivery: { is: null },
      adSalePlacements: { none: {} },
      mutualPromotionDelivery: { is: null },
    },
    select: {
      id: true,
      status: true,
      telegramMessageIds: true,
      telegramIdVerificationStatus: true,
    },
  });
  const byId = new Map(current.map((post) => [post.id, post]));
  return excluded.map((postId) => {
    const post = byId.get(postId);
    if (
      post?.status === 'PUBLISHED' &&
      post.telegramMessageIds.length &&
      post.telegramIdVerificationStatus === 'VERIFIED'
    )
      return {
        postId,
        stage: 'ALREADY_PUBLISHED',
        message:
          'This post already has a verified publication; left unchanged.',
      };
    if (post?.status === 'DRAFT')
      return {
        postId,
        stage: 'DRAFTED',
        message: 'This post is already a draft; left unchanged.',
      };
    return {
      postId,
      stage: 'FAILED',
      message:
        'Post is no longer eligible for scheduled recovery; refresh and recover its current status.',
    };
  });
}

/** Both plan and execution use the same ordinary-post boundary. */
export function ordinaryScheduledPostWhere(
  workspaceId: string,
  telegramChannelId: string,
  postIds?: string[],
): Prisma.TelegramManagedPostWhereInput {
  return {
    workspaceId,
    telegramChannelId,
    status: 'SCHEDULED',
    postBatchDelivery: { is: null },
    adSalePlacements: { none: {} },
    mutualPromotionDelivery: { is: null },
    ...(postIds ? { id: { in: postIds } } : {}),
  };
}

/** Preserve confirmed schedules without claims, media preparation or remote writes. */
export function preservedScheduleStage(
  post: TelegramManagedPost,
  context: ReschedulerAccountContext | undefined,
  overlapping: boolean,
): 'LOCAL_SCHEDULE_PRESERVED' | 'NATIVE_SCHEDULE_PRESERVED' | undefined {
  if (!post.scheduledAt || post.scheduledAt.getTime() <= Date.now()) return;
  if (post.scheduleMode === 'LOCAL') return 'LOCAL_SCHEDULE_PRESERVED';
  if (
    overlapping ||
    !post.sourceId ||
    !context ||
    !post.telegramScheduledMessageIds.length
  )
    return;
  const candidates = context.error
    ? [context.confirmationOnlyScheduledMessages]
    : [context.scheduledMessages, context.confirmationOnlyScheduledMessages];
  if (candidates.some((messages) => exactNativeScheduleMatches(post, messages)))
    return 'NATIVE_SCHEDULE_PRESERVED';
}

/** Existing IDs may be changed only after proving they still identify this post. */
export function assertExistingNativeScheduleIdentity(
  post: Pick<
    TelegramManagedPost,
    | 'scheduleMode'
    | 'telegramScheduledMessageIds'
    | 'text'
    | 'imageUrls'
    | 'mediaItems'
  >,
  context: ReschedulerAccountContext | undefined,
) {
  if (post.scheduleMode === 'LOCAL' || !post.telegramScheduledMessageIds.length)
    return;
  // An alternate reader may preserve exact positive evidence, never authorize
  // cancellation. The execution path separately rejects an unavailable sender.
  if (!context || context.error) return;
  const present = post.telegramScheduledMessageIds.some((id) =>
    context.scheduledIds.has(id),
  );
  if (!present) return;
  if (!nativeScheduleContentMatches(post, context.scheduledMessages))
    throw new Error(
      'Stored Telegram scheduled IDs do not identify this complete post content and media; no schedule was changed.',
    );
}

/** IDs and timestamps alone cannot confirm a different post's remote content. */
function exactNativeScheduleMatches(
  post: TelegramManagedPost,
  snapshot: ReschedulerAccountContext['scheduledMessages'],
) {
  if (
    !snapshot ||
    !post.scheduledAt ||
    !nativeScheduleContentMatches(post, snapshot)
  )
    return false;
  const byId = new Map(snapshot.map((message) => [message.id, message]));
  const planned = Math.floor(post.scheduledAt.getTime() / 1_000);
  return post.telegramScheduledMessageIds.every((id) => {
    const message = byId.get(id);
    return (
      message?.date &&
      Math.floor(new Date(message.date).getTime() / 1_000) === planned
    );
  });
}

export function nativeScheduleContentMatches(
  post: Pick<
    TelegramManagedPost,
    'telegramScheduledMessageIds' | 'text' | 'imageUrls' | 'mediaItems'
  >,
  snapshot: ReschedulerAccountContext['scheduledMessages'],
) {
  if (!snapshot) return false;
  const byId = new Map(snapshot.map((message) => [message.id, message]));
  // A malformed snapshot or repeated local ID cannot establish unique identity.
  if (
    byId.size !== snapshot.length ||
    new Set(post.telegramScheduledMessageIds).size !==
      post.telegramScheduledMessageIds.length
  )
    return false;
  const messages = post.telegramScheduledMessageIds.map((id) => byId.get(id));
  if (messages.some((message) => !message)) return false;
  const present = messages.filter(
    (message): message is NonNullable<typeof message> => Boolean(message),
  );
  const expectedMedia = normalizeTelegramPostMediaItems(
    post.mediaItems,
    post.imageUrls,
  ).length;
  if (present.filter((message) => message.hasMedia).length !== expectedMedia)
    return false;
  const visible = normalizeTelegramPlainText(
    present
      .map((message) => message.text || '')
      .filter(Boolean)
      .join(' '),
  );
  return visible === normalizeManagedPostMarkup(post.text || '');
}

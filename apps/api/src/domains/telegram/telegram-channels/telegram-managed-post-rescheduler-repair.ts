import type { TelegramManagedPost } from '@prisma/client';
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
  history: Awaited<ReturnType<TelegramMtprotoClient['getManagedPostMessages']>> | undefined;
}) {
  const { post, context } = input;
  if (!post.sourceId || !context || context.error || !context.scheduledMessages)
    throw new Error('Original sender complete scheduled queue is unavailable; no replacement sent.');
  if (post.telegramScheduledMessageIds.some((id) => context.scheduledIds.has(id)))
    throw new Error('Only part of this post remains scheduled in Telegram; reconcile the partial schedule before retrying.');
  // Older native rows mirrored scheduled IDs into telegramMessageIds. Those
  // IDs are not evidence in the published channel message namespace.
  const actualMessageIds = post.telegramMessageIds.filter(
    (id) => !post.telegramScheduledMessageIds.includes(id),
  );
  const operations = await input.prisma.telegramManagedPostSendOperation.count({
    where: { postId: post.id, workspaceId: input.workspaceId, channelId: input.channelId },
  });
  if (operations || post.deliveryAttemptCount || post.publishedAt ||
      post.telegramRemoteStatus === 'PUBLISHED' || actualMessageIds.length)
    throw new Error('Post has delivery evidence; reconcile the send journal or publication before restoring its schedule.');
  const expected = input.identity.normalizedPlainText(post.text || '');
  const matchingContent = (message: { text: string; hasMedia: boolean }) => {
    const visible = input.identity.normalizedPlainText(message.text || '');
    // Include partial text: a previous multipart schedule may have survived
    // with new IDs. Ambiguous content is a reason to inspect, never to replay.
    return expected && visible
      ? expected.includes(visible) || visible.includes(expected)
      : !expected && message.hasMedia;
  };
  if (!input.history?.recentPublishedComplete)
    throw new Error('Published history is incomplete; cannot exclude an early Telegram publication.');
  if (input.history.recentPublished.some(matchingContent))
    throw new Error('Matching content is already published in Telegram; reconcile its identity before restoring a schedule.');
  if (context.scheduledMessages.some(matchingContent))
    throw new Error('Telegram contains a matching unlinked scheduled message; reconcile its identity before creating a replacement.');
}

/** Fetch publication evidence for overdue posts and absent future native entries. */
export function historyCandidatesForReschedule(
  posts: TelegramManagedPost[],
  contexts: Map<string, ReschedulerAccountContext>,
  now: Date,
) {
  return posts.filter((post) => !post.scheduledAt || post.scheduledAt <= now || (
    post.scheduleMode !== 'LOCAL' && post.telegramScheduledMessageIds.some(
      (id) => !contexts.get(post.sourceId ?? '')?.scheduledIds.has(id),
    )
  ));
}

/** Reject both rows when corrupt local identities alias the same remote queue ID. */
export function overlappingNativeSchedules(posts: TelegramManagedPost[]) {
  const ownerByRemoteId = new Map<string, string>();
  const overlapping = new Set<string>();
  for (const post of posts) {
    if (post.scheduleMode === 'LOCAL') continue;
    for (const id of new Set(post.telegramScheduledMessageIds)) {
      const key = `${post.sourceId ?? ''}:${id}`;
      const owner = ownerByRemoteId.get(key);
      if (owner && owner !== post.id) { overlapping.add(owner); overlapping.add(post.id); }
      ownerByRemoteId.set(key, post.id);
    }
  }
  return overlapping;
}

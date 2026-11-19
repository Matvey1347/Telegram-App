import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { RescheduleChannelScheduledPostProgress } from '@telegram-system/shared';
import type { TelegramChannelAccessService } from './telegram-channel-access.service';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';

type RemotePost = {
  sourceId: string | null;
  scheduleMode: string | null;
  scheduledAt: Date | null;
  createdAt?: Date;
  telegramScheduledMessageIds: string[];
};

export type ReschedulerAccountContext = {
  credentials?: ReturnType<TelegramChannelAccessService['accountCredentials']>;
  scheduledIds: Set<string>;
  scheduledMessages?: Awaited<
    ReturnType<TelegramMtprotoClient['getScheduledHistory']>
  >;
  error?: string;
};

type ProgressHandler = (
  item: RescheduleChannelScheduledPostProgress,
  current: number,
  total: number,
) => void;

type RemoteDependencies = {
  access: TelegramChannelAccessService;
  mtprotoClient: TelegramMtprotoClient;
};

export async function loadTelegramScheduledQueues(
  deps: RemoteDependencies,
  input: {
    workspaceId: string;
    channelId: string;
    channelReference: ReturnType<
      TelegramChannelAccessService['mtprotoChannelReference']
    >;
    posts: RemotePost[];
    total: number;
    onProgress?: ProgressHandler;
  },
) {
  const nativePosts = input.posts.filter(
    (post) =>
      post.scheduleMode !== 'LOCAL' ||
      !post.scheduledAt ||
      post.scheduledAt <= new Date(),
  );
  const accountIds = [
    ...new Set(nativePosts.map((post) => post.sourceId ?? '')),
  ];
  const accountContexts = new Map<string, ReschedulerAccountContext>();
  let remoteScheduledCount = 0;
  input.onProgress?.(
    {
      stage: 'LOADING_TELEGRAM_SCHEDULE',
      message: `Loaded ${input.total} local scheduled posts; requesting Telegram's current scheduled queue.`,
    },
    0,
    input.total,
  );

  for (const [accountIndex, accountId] of accountIds.entries()) {
    try {
      input.onProgress?.(
        {
          stage: 'LOADING_TELEGRAM_SCHEDULE',
          message: `Reading the complete Telegram scheduled queue for sender ${accountIndex + 1} of ${accountIds.length}.`,
        },
        0,
        input.total,
      );
      const account = await deps.access.connectedAccount(
        input.workspaceId,
        input.channelId,
        accountId || undefined,
      );
      const credentials = deps.access.accountCredentials(account);
      const remoteScheduled = await deps.mtprotoClient.getScheduledHistory({
        ...credentials,
        channel: input.channelReference,
      });
      const scheduledIds = new Set(
        remoteScheduled.map((message) => message.id),
      );
      remoteScheduledCount += scheduledIds.size;
      input.onProgress?.(
        {
          stage: 'LOADING_TELEGRAM_SCHEDULE',
          message: `Read sender ${accountIndex + 1} of ${accountIds.length}: ${scheduledIds.size} messages are scheduled in Telegram.`,
        },
        0,
        input.total,
      );
      accountContexts.set(accountId, {
        credentials,
        scheduledIds,
        scheduledMessages: remoteScheduled,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Another account can inspect published channel history, but it cannot
      // prove absence in the original sender's account-scoped scheduled queue.
      let credentials: ReschedulerAccountContext['credentials'];
      try {
        const reader = await deps.access.connectedAccount(
          input.workspaceId,
          input.channelId,
        );
        credentials = deps.access.accountCredentials(reader);
      } catch {
        /* Preserve the original queue error. */
      }
      accountContexts.set(accountId, {
        credentials,
        scheduledIds: new Set(),
        error: message,
      });
      input.onProgress?.(
        {
          stage: 'LOADING_TELEGRAM_SCHEDULE',
          message: `Could not read Telegram's scheduled queue for sender ${accountIndex + 1} of ${accountIds.length}: ${message}`,
        },
        0,
        input.total,
      );
    }
  }

  return { accountContexts, accountIds, remoteScheduledCount };
}

export async function loadTelegramPublishedHistory(
  deps: RemoteDependencies,
  input: {
    channelReference: ReturnType<
      TelegramChannelAccessService['mtprotoChannelReference']
    >;
    overduePosts: RemotePost[];
    accountContexts: Map<string, ReschedulerAccountContext>;
    now: Date;
    total: number;
    onProgress?: ProgressHandler;
  },
) {
  const publishedByAccount = new Map<
    string,
    Awaited<ReturnType<TelegramMtprotoClient['getManagedPostMessages']>>
  >();
  const publishedHistoryErrors = new Map<string, string>();
  if (!input.overduePosts.length)
    return { publishedByAccount, publishedHistoryErrors };

  const earliestDue = input.overduePosts
    .map((post) => post.createdAt ?? post.scheduledAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const overdueAccountIds = [
    ...new Set(input.overduePosts.map((post) => post.sourceId ?? '')),
  ];
  input.onProgress?.(
    {
      stage: 'RECONCILING_TELEGRAM',
      message: `Checking published history for ${input.overduePosts.length} overdue or missing scheduled posts.`,
    },
    0,
    input.total,
  );

  // Queue ownership stays account-specific. Published channel history may be
  // shared when unavailable senders fall back to the same connected reader.
  // This cache lives only for this explicit reconciliation operation.
  const historyByReader = new Map<
    string,
    ReturnType<TelegramMtprotoClient['getManagedPostMessages']>
  >();
  for (const [accountIndex, accountId] of overdueAccountIds.entries()) {
    const context = input.accountContexts.get(accountId);
    if (!context?.credentials) {
      if (context?.error) publishedHistoryErrors.set(accountId, context.error);
      continue;
    }
    try {
      const readerKey = context.credentials.session;
      let history = historyByReader.get(readerKey);
      if (!history) {
        history = deps.mtprotoClient.getManagedPostMessages({
          ...context.credentials,
          channel: input.channelReference,
          // Scheduled message IDs use an account queue namespace. They cannot
          // be used as published IDs, and the queue snapshot is already loaded.
          publishedMessageIds: [],
          scheduledMessageIds: [],
          ...(earliestDue
            ? {
                recentPublishedFrom: new Date(
                  earliestDue.getTime() - 6 * 60 * 60_000,
                ),
                recentPublishedUntil: input.now,
              }
            : {}),
        });
        historyByReader.set(readerKey, history);
      }
      const remotePublished = await history;
      publishedByAccount.set(accountId, remotePublished);
      input.onProgress?.(
        {
          stage: 'RECONCILING_TELEGRAM',
          message: `Checked published history for sender ${accountIndex + 1} of ${overdueAccountIds.length} (${remotePublished.published.length} exact messages and ${remotePublished.recentPublished.length} recent messages).`,
        },
        0,
        input.total,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      publishedHistoryErrors.set(accountId, message);
      input.onProgress?.(
        {
          stage: 'RECONCILING_TELEGRAM',
          message: `Could not verify published history for sender ${accountIndex + 1} of ${overdueAccountIds.length}: ${message}`,
        },
        0,
        input.total,
      );
    }
  }

  return { publishedByAccount, publishedHistoryErrors };
}

/** Reuses the post delivery claim; expired reschedule preparation cannot send. */
export const rescheduleContext = new AsyncLocalStorage<{
  owner: string;
  signal: AbortSignal;
  scheduledAt?: Date;
  confirmedMissingScheduleFor?: string;
}>();
export async function assertRescheduleActive(
  prisma: PrismaService,
  postId: string,
) {
  const context = rescheduleContext.getStore();
  if (!context) return;
  context.signal.throwIfAborted();
  if (context.scheduledAt && context.scheduledAt.getTime() <= Date.now())
    throw new Error(
      'Native reschedule time has elapsed; refresh before retrying',
    );
  const owned = await prisma.telegramManagedPost.count({
    where: {
      id: postId,
      status: 'SCHEDULED',
      deliveryClaimOwner: context.owner,
      deliveryClaimExpiresAt: { gt: new Date() },
    },
  });
  context.signal.throwIfAborted();
  if (context.scheduledAt && context.scheduledAt.getTime() <= Date.now())
    throw new Error(
      'Native reschedule time has elapsed; refresh before retrying',
    );
  if (owned !== 1)
    throw new Error(
      'Rescheduling ownership expired; inspect Telegram before retrying',
    );
}

/** Original account owns the native queue, including when a new publisher is selected. */
export async function cancelPreviousNativeSchedule(
  deps: RemoteDependencies & { prisma: PrismaService },
  input: {
    workspaceId: string;
    channelId: string;
    channel: ReturnType<
      TelegramChannelAccessService['mtprotoChannelReference']
    >;
    post: {
      id: string;
      status: string;
      sourceId: string | null;
      sourceType: string | null;
      telegramScheduledMessageIds: string[];
    };
    sourceId: string;
    account: Awaited<
      ReturnType<TelegramChannelAccessService['connectedAccount']>
    >;
    onCancel: () => void;
  },
) {
  const { post } = input;
  if (
    post.status !== 'SCHEDULED' ||
    !post.telegramScheduledMessageIds.length ||
    (post.sourceId !== input.sourceId && post.sourceType !== 'MTPROTO')
  )
    return false;
  if (rescheduleContext.getStore()?.confirmedMissingScheduleFor === post.id) {
    await assertRescheduleActive(deps.prisma, post.id);
    return false;
  }
  const previousAccount =
    post.sourceId === input.sourceId
      ? input.account
      : await deps.access.connectedAccount(
          input.workspaceId,
          input.channelId,
          post.sourceId ?? undefined,
        );
  await assertRescheduleActive(deps.prisma, post.id);
  input.onCancel();
  await deps.mtprotoClient.deleteScheduledPost({
    ...deps.access.accountCredentials(previousAccount),
    channel: input.channel,
    messageIds: post.telegramScheduledMessageIds,
  });
  return true;
}

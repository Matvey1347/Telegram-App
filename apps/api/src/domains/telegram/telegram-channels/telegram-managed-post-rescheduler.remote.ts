import type { RescheduleChannelScheduledPostProgress } from '@telegram-system/shared';
import type { TelegramChannelAccessService } from './telegram-channel-access.service';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';

type RemotePost = {
  sourceId: string | null;
  scheduleMode: string | null;
  scheduledAt: Date | null;
  telegramScheduledMessageIds: string[];
};

export type ReschedulerAccountContext = {
  credentials?: ReturnType<TelegramChannelAccessService['accountCredentials']>;
  scheduledIds: Set<string>;
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
    (post) => post.scheduleMode !== 'LOCAL',
  );
  const accountIds = [
    ...new Set(nativePosts.map((post) => post.sourceId ?? '')),
  ];
  const accountContexts = new Map<string, ReschedulerAccountContext>();
  let remoteScheduledCount = 0;
  let checkedPostCount = 0;
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
      const senderPosts = nativePosts.filter(
        (post) => (post.sourceId ?? '') === accountId,
      );
      const scheduledMessageIds = [
        ...new Set(
          senderPosts.flatMap((post) => post.telegramScheduledMessageIds),
        ),
      ];
      input.onProgress?.(
        {
          stage: 'LOADING_TELEGRAM_SCHEDULE',
          message: `Checking ${scheduledMessageIds.length} stored Telegram schedule IDs for sender ${accountIndex + 1} of ${accountIds.length}.`,
        },
        checkedPostCount,
        input.total,
      );
      const account = await deps.access.connectedAccount(
        input.workspaceId,
        input.channelId,
        accountId || undefined,
      );
      const credentials = deps.access.accountCredentials(account);
      const scheduledIds = new Set<string>();
      const messageIdBatches = Array.from(
        { length: Math.ceil(scheduledMessageIds.length / 100) },
        (_, index) => scheduledMessageIds.slice(index * 100, index * 100 + 100),
      );
      const checkedMessageIds = new Set<string>();
      for (const [batchIndex, messageIds] of messageIdBatches.entries()) {
        const remoteScheduled =
          await deps.mtprotoClient.getScheduledMessagesByIds({
            ...credentials,
            channel: input.channelReference,
            messageIds,
          });
        remoteScheduledCount += remoteScheduled.length;
        remoteScheduled.forEach((message) => scheduledIds.add(message.id));
        messageIds.forEach((id) => checkedMessageIds.add(id));
        const checkedPosts = senderPosts.filter(
          (post) =>
            post.telegramScheduledMessageIds.length > 0 &&
            post.telegramScheduledMessageIds.every((id) =>
              checkedMessageIds.has(id),
            ),
        ).length;
        input.onProgress?.(
          {
            stage: 'LOADING_TELEGRAM_SCHEDULE',
            message: `Checked Telegram schedule IDs for sender ${accountIndex + 1} of ${accountIds.length}, batch ${batchIndex + 1} of ${messageIdBatches.length} (${scheduledIds.size} still scheduled).`,
          },
          checkedPostCount + checkedPosts,
          input.total,
        );
      }
      checkedPostCount += senderPosts.length;
      if (messageIdBatches.length === 0) {
        input.onProgress?.(
          {
            stage: 'LOADING_TELEGRAM_SCHEDULE',
            message: `Sender ${accountIndex + 1} of ${accountIds.length} has no stored Telegram schedule IDs to check.`,
          },
          checkedPostCount,
          input.total,
        );
      }
      accountContexts.set(accountId, {
        credentials,
        scheduledIds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      accountContexts.set(accountId, {
        scheduledIds: new Set(),
        error: message,
      });
      input.onProgress?.(
        {
          stage: 'LOADING_TELEGRAM_SCHEDULE',
          message: `Could not read Telegram's scheduled queue for sender ${accountIndex + 1} of ${accountIds.length}: ${message}`,
        },
        checkedPostCount,
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
    .map((post) => post.scheduledAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => left.getTime() - right.getTime())[0];
  const overdueAccountIds = [
    ...new Set(
      input.overduePosts
        .filter((post) => post.scheduleMode !== 'LOCAL')
        .map((post) => post.sourceId ?? ''),
    ),
  ];
  input.onProgress?.(
    {
      stage: 'RECONCILING_TELEGRAM',
      message: `Checking ${input.overduePosts.length} overdue posts for actual publication in Telegram.`,
    },
    0,
    input.total,
  );

  for (const [accountIndex, accountId] of overdueAccountIds.entries()) {
    const context = input.accountContexts.get(accountId);
    if (!context?.credentials) {
      if (context?.error) publishedHistoryErrors.set(accountId, context.error);
      continue;
    }
    const overdueIds = [
      ...new Set(
        input.overduePosts
          .filter((post) => (post.sourceId ?? '') === accountId)
          .flatMap((post) => post.telegramScheduledMessageIds),
      ),
    ];
    try {
      const remotePublished = await deps.mtprotoClient.getManagedPostMessages({
        ...context.credentials,
        channel: input.channelReference,
        publishedMessageIds: overdueIds,
        scheduledMessageIds: overdueIds,
        ...(earliestDue
          ? {
              recentPublishedFrom: new Date(
                earliestDue.getTime() - 6 * 60 * 60_000,
              ),
              recentPublishedUntil: input.now,
            }
          : {}),
      });
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

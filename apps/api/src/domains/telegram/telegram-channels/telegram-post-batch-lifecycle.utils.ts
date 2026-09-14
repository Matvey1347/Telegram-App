import type {
  Prisma,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostStatus,
  TelegramSourceType,
} from '@prisma/client';

export type ClaimedPostBatchDelivery = {
  id: string;
  batchId: string;
  workspaceId: string;
  telegramChannelId: string;
  managedPostId: string;
  scheduledAt: Date;
  deleteAfterHours: number | null;
  longTextMode: string;
  attemptCount: number;
  claimOwner: string;
  managedPost: {
    status: TelegramManagedPostStatus;
    publishedAt: Date | null;
    telegramRemoteStatus: TelegramManagedPostRemoteStatus;
    telegramMessageIds: string[];
    text: string | null;
    buttonRows: Prisma.JsonValue;
    sourceType: TelegramSourceType | null;
    lastError: string | null;
  };
};

export async function runPostBatchByChannel<
  T extends { telegramChannelId: string },
>(rows: T[], concurrency: number, work: (row: T) => Promise<unknown>) {
  const queues = [
    ...groupPostBatchRows(rows, (row) => row.telegramChannelId).values(),
  ];
  for (let index = 0; index < queues.length; index += concurrency) {
    await Promise.all(
      queues.slice(index, index + concurrency).map(async (queue) => {
        for (const row of queue) await work(row);
      }),
    );
  }
}

export function groupPostBatchRows<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
  }
  return groups;
}

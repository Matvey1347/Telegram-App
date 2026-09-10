import { Injectable } from '@nestjs/common';
import type {
  MutualPromotionFolderExpense,
  MutualPromotionFolderParticipantStats,
} from '@telegram-system/shared';

type ParticipantForStatistics = {
  subscribersAtStart: number | null;
  subscribersAtEnd: number | null;
  inviteJoinedAtStart: number | null;
  inviteJoinedAtEnd: number | null;
  baselineCapturedAt: Date | null;
  finalCapturedAt: Date | null;
  currentSubscribersCount?: number | null;
  currentInviteJoinedCount?: number | null;
  expense: null | {
    id: string;
    accountId: string;
    amount: unknown;
    currency: string;
    amountInPrimaryCurrency: unknown;
    account: { name: string };
  };
};

@Injectable()
export class MutualPromotionStatisticsService {
  expense(row: ParticipantForStatistics): MutualPromotionFolderExpense | null {
    const expense = row.expense;
    if (!expense) return null;
    return {
      transactionId: expense.id,
      accountId: expense.accountId,
      accountName: expense.account.name,
      amount: Number(expense.amount),
      currency: expense.currency,
      amountInPrimaryCurrency: Number(expense.amountInPrimaryCurrency),
    };
  }

  participant(
    row: ParticipantForStatistics,
    options: { useCurrentCounters?: boolean } = {},
  ): MutualPromotionFolderParticipantStats {
    const inviteJoinedAtEnd =
      row.inviteJoinedAtEnd ??
      (options.useCurrentCounters ? row.currentInviteJoinedCount : null);
    const subscribersAtEnd =
      row.subscribersAtEnd ??
      (options.useCurrentCounters ? row.currentSubscribersCount : null);
    const joinedCount =
      row.inviteJoinedAtStart !== null && inviteJoinedAtEnd != null
        ? Math.max(0, inviteJoinedAtEnd - row.inviteJoinedAtStart)
        : null;
    const audienceDelta =
      row.subscribersAtStart !== null && subscribersAtEnd != null
        ? subscribersAtEnd - row.subscribersAtStart
        : null;
    const unsubscribedCount =
      joinedCount !== null && audienceDelta !== null
        ? Math.max(0, joinedCount - audienceDelta)
        : null;
    const expense = this.expense(row);
    return {
      joinedCount,
      unsubscribedCount,
      unsubscribedIsEstimate: unsubscribedCount !== null,
      audienceDelta,
      subscriberPrice:
        expense && joinedCount !== null && joinedCount > 0
          ? expense.amount / joinedCount
          : null,
      currency: expense?.currency ?? null,
      dataQuality:
        row.baselineCapturedAt &&
        row.finalCapturedAt &&
        row.subscribersAtStart !== null &&
        row.subscribersAtEnd !== null &&
        row.inviteJoinedAtStart !== null &&
        row.inviteJoinedAtEnd !== null
          ? 'CACHED_BOUNDARIES'
          : options.useCurrentCounters &&
              row.baselineCapturedAt &&
              row.subscribersAtStart !== null &&
              subscribersAtEnd != null &&
              row.inviteJoinedAtStart !== null &&
              inviteJoinedAtEnd != null
            ? 'CURRENT_COUNTERS'
            : row.baselineCapturedAt || row.finalCapturedAt
              ? 'INCOMPLETE'
              : 'PENDING',
    };
  }
}

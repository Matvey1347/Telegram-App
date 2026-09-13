import { Injectable } from '@nestjs/common';
import type {
  MutualPromotionFolderExpense,
  MutualPromotionFolderParticipantStats,
} from '@telegram-system/shared';

type ParticipantForStatistics = {
  role: 'PUBLISHER' | 'PAID';
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
      row.role === 'PUBLISHER' &&
      row.subscribersAtStart !== null &&
      subscribersAtEnd != null
        ? subscribersAtEnd - row.subscribersAtStart
        : null;
    const unsubscribedCount =
      joinedCount !== null && audienceDelta !== null
        ? Math.max(0, joinedCount - audienceDelta)
        : null;
    const retainedCount =
      row.role === 'PUBLISHER' && joinedCount !== null && audienceDelta !== null
        ? Math.min(joinedCount, Math.max(0, audienceDelta))
        : null;
    const expense = this.expense(row);
    const inviteBoundariesComplete =
      row.baselineCapturedAt &&
      row.finalCapturedAt &&
      row.inviteJoinedAtStart !== null &&
      row.inviteJoinedAtEnd !== null;
    const audienceBoundariesComplete =
      row.subscribersAtStart !== null && row.subscribersAtEnd !== null;
    const currentInviteCountersComplete =
      row.baselineCapturedAt &&
      row.inviteJoinedAtStart !== null &&
      inviteJoinedAtEnd != null;
    const currentAudienceCountersComplete =
      row.subscribersAtStart !== null && subscribersAtEnd != null;
    return {
      joinedCount,
      unsubscribedCount,
      unsubscribedIsEstimate: unsubscribedCount !== null,
      audienceDelta,
      retainedCount,
      subscriberPrice:
        expense && joinedCount !== null && joinedCount > 0
          ? expense.amount / joinedCount
          : null,
      retainedSubscriberPrice:
        expense && retainedCount !== null && retainedCount > 0
          ? expense.amount / retainedCount
          : null,
      currency: expense?.currency ?? null,
      dataQuality:
        inviteBoundariesComplete &&
        (row.role === 'PAID' || audienceBoundariesComplete)
          ? 'CACHED_BOUNDARIES'
          : options.useCurrentCounters &&
              currentInviteCountersComplete &&
              (row.role === 'PAID' || currentAudienceCountersComplete)
            ? 'CURRENT_COUNTERS'
            : row.baselineCapturedAt || row.finalCapturedAt
              ? 'INCOMPLETE'
              : 'PENDING',
    };
  }
}

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
  ): MutualPromotionFolderParticipantStats {
    const joinedCount =
      row.inviteJoinedAtStart !== null && row.inviteJoinedAtEnd !== null
        ? Math.max(0, row.inviteJoinedAtEnd - row.inviteJoinedAtStart)
        : null;
    const audienceDelta =
      row.subscribersAtStart !== null && row.subscribersAtEnd !== null
        ? row.subscribersAtEnd - row.subscribersAtStart
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
          : row.baselineCapturedAt || row.finalCapturedAt
            ? 'INCOMPLETE'
            : 'PENDING',
    };
  }
}

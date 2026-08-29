import type {
  TelegramAdCrmFrequencyBucket,
  TelegramAdCrmRecencyBucket,
  TelegramAdCrmRfmSegment,
  TelegramAdCrmUrgency,
} from '@telegram-system/shared';
import {
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
} from '@prisma/client';

export const normalizeTelegramUsername = (value: string | null | undefined) =>
  value?.trim().replace(/^@/, '').toLowerCase() || null;

export const normalizePhone = (value: string | null | undefined) =>
  value?.replace(/[^\d+]/g, '').trim() || null;

export const normalizeEmail = (value: string | null | undefined) =>
  value?.trim().toLowerCase() || null;

export const daysSince = (value: Date | null | undefined, now: Date) =>
  value
    ? Math.max(
        0,
        Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)),
      )
    : null;

export const recencyBucket = (
  lastPurchaseAt: Date | null | undefined,
  now: Date,
): TelegramAdCrmRecencyBucket => {
  const days = daysSince(lastPurchaseAt, now);
  if (days === null) return 'NONE';
  if (days <= 30) return 'RECENT';
  if (days <= 90) return 'WARM';
  if (days <= 180) return 'COLD';
  return 'DORMANT';
};

export const frequencyBucket = (
  completedSalesCount: number,
  totalSalesCount: number,
): TelegramAdCrmFrequencyBucket => {
  const count = Math.max(completedSalesCount, totalSalesCount);
  if (count <= 0) return 'NONE';
  if (count === 1) return 'ONE_TIME';
  if (count >= 10) return 'POWER';
  if (count >= 5) return 'LOYAL';
  if (count >= 2) return 'REPEAT';
  return 'POWER';
};

export const completedPlacementsCount = (
  placements: Array<{ status?: string | null }>,
) =>
  placements.filter((placement) =>
    ['PUBLISHED', 'COMPLETED'].includes(String(placement.status)),
  ).length;

export const monetaryBucket = (
  monetaryValue: number,
  highValueThreshold: number,
) => {
  if (highValueThreshold <= 0) return monetaryValue > 0 ? 'HIGH' : 'LOW';
  if (monetaryValue >= highValueThreshold) return 'HIGH';
  if (monetaryValue >= highValueThreshold / 2) return 'MID';
  return 'LOW';
};

export const rfmSegment = (params: {
  status: TelegramAdvertiserStatus;
  completedSalesCount: number;
  recencyBucket: TelegramAdCrmRecencyBucket;
  frequencyBucket: TelegramAdCrmFrequencyBucket;
  monetaryBucket: 'LOW' | 'MID' | 'HIGH';
  lifecycleStage: TelegramAdvertiserLifecycleStage;
}): TelegramAdCrmRfmSegment => {
  if (params.status === TelegramAdvertiserStatus.LOST) return 'LOST';
  if (params.completedSalesCount <= 0) return 'LEAD';
  if (params.recencyBucket === 'DORMANT') return 'DORMANT';
  if (params.recencyBucket === 'COLD') return 'AT_RISK';
  if (
    params.monetaryBucket === 'HIGH' &&
    ['POWER', 'LOYAL'].includes(params.frequencyBucket) &&
    ['RECENT', 'WARM'].includes(params.recencyBucket)
  ) {
    return 'CHAMPION';
  }
  if (['POWER', 'LOYAL', 'REPEAT'].includes(params.frequencyBucket)) {
    return 'LOYAL';
  }
  if (
    params.frequencyBucket === 'ONE_TIME' &&
    params.recencyBucket === 'RECENT'
  ) {
    return 'NEW';
  }
  if (
    params.lifecycleStage === TelegramAdvertiserLifecycleStage.QUALIFIED ||
    params.recencyBucket === 'WARM'
  ) {
    return 'PROMISING';
  }
  return 'LEAD';
};

const taskPriorityOffset = (priority: TelegramAdvertiserTaskPriority) => {
  if (priority === TelegramAdvertiserTaskPriority.URGENT) return 0;
  if (priority === TelegramAdvertiserTaskPriority.HIGH) return 2;
  if (priority === TelegramAdvertiserTaskPriority.NORMAL) return 5;
  return 8;
};

export const crmPriority = (params: {
  segment: TelegramAdCrmRfmSegment;
  nextOpenTask: {
    dueAt: Date;
    priority: TelegramAdvertiserTaskPriority;
  } | null;
  nextContactAt: Date | null;
  now: Date;
}): { priorityRank: number; urgency: TelegramAdCrmUrgency } => {
  const taskDays = daysSince(params.nextOpenTask?.dueAt, params.now);
  if (params.nextOpenTask && taskDays !== null) {
    if (params.nextOpenTask.dueAt.getTime() <= params.now.getTime()) {
      return {
        priorityRank: 1 + taskPriorityOffset(params.nextOpenTask.priority),
        urgency: 'HIGH',
      };
    }
    const daysUntilTask = Math.ceil(
      (params.nextOpenTask.dueAt.getTime() - params.now.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (daysUntilTask <= 3) {
      return {
        priorityRank: 10 + taskPriorityOffset(params.nextOpenTask.priority),
        urgency: 'HIGH',
      };
    }
    if (daysUntilTask <= 7) {
      return {
        priorityRank: 25 + taskPriorityOffset(params.nextOpenTask.priority),
        urgency: 'MEDIUM',
      };
    }
  }
  if (params.nextContactAt) {
    if (params.nextContactAt.getTime() <= params.now.getTime()) {
      return { priorityRank: 15, urgency: 'HIGH' };
    }
    const daysUntilContact = Math.ceil(
      (params.nextContactAt.getTime() - params.now.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (daysUntilContact <= 7) return { priorityRank: 35, urgency: 'MEDIUM' };
  }
  if (params.segment === 'DORMANT')
    return { priorityRank: 45, urgency: 'HIGH' };
  if (params.segment === 'AT_RISK')
    return { priorityRank: 55, urgency: 'MEDIUM' };
  if (params.segment === 'LEAD') return { priorityRank: 65, urgency: 'MEDIUM' };
  if (params.segment === 'PROMISING' || params.segment === 'NEW') {
    return { priorityRank: 75, urgency: 'LOW' };
  }
  if (params.segment === 'LOST') return { priorityRank: 95, urgency: 'NONE' };
  return { priorityRank: 85, urgency: 'LOW' };
};

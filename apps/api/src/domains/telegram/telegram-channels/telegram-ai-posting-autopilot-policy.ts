import type { TelegramPublicationSlotOccurrence } from '@telegram-system/shared';
import {
  publicationScheduleLocalDateFormatter,
  publicationScheduleLocalDateParts,
} from './telegram-publication-schedule-times';
import type { PrismaService } from '../../../prisma/prisma.service';
import { editorialDraftWhere } from './telegram-managed-draft-editorial';

export const AUTOPILOT_REFILL_DAYS = 10;
export const AUTOPILOT_COVERAGE_DAYS = 20;
export const AUTOPILOT_STOCK_DAYS = 50;
export const AUTOPILOT_STOCK_CAP = 150;

type ChannelScope = { workspaceId: string; telegramChannelId: string };

export async function readAutopilotCadence(
  prisma: PrismaService,
  scope: ChannelScope,
) {
  const assignment =
    await prisma.telegramChannelPublicationScheduleAssignment.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        channelId: scope.telegramChannelId,
      },
      select: {
        selectionMode: true,
        selectedSlots: { select: { slotId: true } },
        schedule: {
          select: {
            slots: {
              where: { isActive: true, kind: 'CONTENT' },
              select: { id: true, time: true, isOptional: true },
            },
          },
        },
      },
    });
  const selected = new Set(
    assignment?.selectedSlots.map(({ slotId }) => slotId),
  );
  const slots =
    assignment?.schedule.slots.filter(
      ({ id }) => assignment.selectionMode === 'FULL' || selected.has(id),
    ) ?? [];
  const minimumPerDay = new Set(
    slots.filter(({ isOptional }) => !isOptional).map(({ time }) => time),
  ).size;
  const maximumPerDay = new Set(slots.map(({ time }) => time)).size;
  const plannedPerDay = (minimumPerDay + maximumPerDay) / 2;
  return {
    weeklySlotsMin: minimumPerDay * 7,
    weeklySlotsMax: maximumPerDay * 7,
    plannedPerDay,
    targetReadyDrafts: Math.min(
      AUTOPILOT_STOCK_CAP,
      Math.ceil(plannedPerDay * AUTOPILOT_STOCK_DAYS),
    ),
  };
}

export function autopilotContentSlots(
  occurrences: TelegramPublicationSlotOccurrence[],
) {
  const selected = new Map<string, TelegramPublicationSlotOccurrence>();
  const formatters = new Map<string, Intl.DateTimeFormat>();
  for (const slot of occurrences) {
    if (slot.kind !== 'CONTENT' || slot.state === 'PAST') continue;
    if (slot.isOptional && slot.state !== 'OCCUPIED') {
      const formatter =
        formatters.get(slot.timezone) ??
        publicationScheduleLocalDateFormatter(slot.timezone);
      formatters.set(slot.timezone, formatter);
      const { year, month, day } = publicationScheduleLocalDateParts(
        new Date(slot.scheduledAt),
        formatter,
      );
      if ((Date.UTC(year, month - 1, day) / 86_400_000) % 2 !== 0) continue;
    }
    const prior = selected.get(slot.scheduledAt);
    if (!prior || (prior.isOptional && !slot.isOptional))
      selected.set(slot.scheduledAt, slot);
  }
  return [...selected.values()].sort((left, right) =>
    left.scheduledAt.localeCompare(right.scheduledAt),
  );
}

export async function automaticPostingAiAvailable(
  prisma: PrismaService,
  workspaceId: string,
) {
  const categories = [
    'TELEGRAM_POSTING_PLAN',
    'TELEGRAM_POSTING_TEXT',
    'TELEGRAM_POSTING_REVIEW',
    'TELEGRAM_POSTING_IMAGE',
  ];
  const [workspace, configured] = await Promise.all([
    prisma.aiWorkspaceConfig.findUnique({
      where: { workspaceId },
      select: {
        enabled: true,
        automaticEnabled: true,
        aiPostingUnlimited: true,
        dailyBudget: true,
        monthlyBudget: true,
        maxRequestCost: true,
      },
    }),
    prisma.aiCategoryConfig.findMany({
      where: {
        workspaceId,
        category: { in: categories },
        enabled: true,
        automaticEnabled: true,
      },
      select: { dailyBudget: true, monthlyBudget: true },
    }),
  ]);
  return Boolean(
    workspace?.enabled &&
    workspace.automaticEnabled &&
    configured.length === categories.length &&
    (workspace.aiPostingUnlimited ||
      (workspace.dailyBudget?.gt(0) &&
        workspace.monthlyBudget?.gt(0) &&
        workspace.maxRequestCost?.gt(0) &&
        configured.every(
          (category) =>
            category.dailyBudget?.gt(0) && category.monthlyBudget?.gt(0),
        ))),
  );
}

export function autopilotReadyDraftWhere(
  scope: ChannelScope,
  expiration: Date,
) {
  return {
    ...editorialDraftWhere(scope),
    text: { not: null },
    imageUrls: { isEmpty: false },
    aiPostingRecheckRequired: false,
    AND: [
      {
        OR: [
          { aiPostingReviewStatus: null },
          { aiPostingReviewStatus: 'APPROVED' },
        ],
      },
      {
        OR: [
          { aiPostingGeneration: { is: null } },
          { createdAt: { gte: expiration } },
        ],
      },
    ],
  } satisfies import('@prisma/client').Prisma.TelegramManagedPostWhereInput;
}

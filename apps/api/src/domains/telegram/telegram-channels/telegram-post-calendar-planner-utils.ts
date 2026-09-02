import type {
  TelegramPostPlannerFormat,
  TelegramPostPlannerSlot,
} from '@prisma/client';
import { utcDateKey } from '../telegram-ad-sales/domain/timezone';
import { telegramPostsBadRequest } from './telegram-posts.errors';

export const serializePlannerFormat = (format: TelegramPostPlannerFormat) => ({
  id: format.id,
  telegramChannelId: format.telegramChannelId,
  name: format.name,
  description: format.description,
  icon: format.icon,
  position: format.position,
  isActive: format.isActive,
});

export const serializePlannerSlot = (slot: TelegramPostPlannerSlot) => ({
  id: slot.id,
  telegramChannelId: slot.telegramChannelId,
  formatId: slot.formatId,
  postGroupIds: slot.postGroupIds,
  weekday: slot.weekday,
  time: slot.time,
  timezone: slot.timezone,
  position: slot.position,
  isActive: slot.isActive,
});

export const plannerDateKeyFromInput = (value: string, timezone: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw telegramPostsBadRequest(
      'TELEGRAM_POST_PLANNER_RANGE_INVALID',
      'Planner date is invalid',
      { value },
    );
  }
  return utcDateKey(parsed, timezone);
};

export const plannerDateKeys = (from: string, to: string) => {
  const dates: string[] = [];
  let cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
};

export const plannerWeekday = (dateKey: string) =>
  new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();

export const rotatePlannerItems = <T>(items: T[], offset: number) => {
  if (!items.length) return [];
  const normalized = offset % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
};

import type { Prisma, TelegramAdvertiserTask } from '@prisma/client';
import type { UpdateTelegramAdvertiserTaskDto } from './dto';

export function crmTaskChanges(
  existing: TelegramAdvertiserTask,
  dto: UpdateTelegramAdvertiserTaskDto,
) {
  const candidates = {
    ...(dto.assignedMemberId === undefined
      ? {}
      : { assignedMemberId: dto.assignedMemberId }),
    ...(dto.status === undefined ? {} : { status: dto.status }),
    ...(dto.priority === undefined ? {} : { priority: dto.priority }),
    ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
    ...(dto.description === undefined
      ? {}
      : { description: dto.description?.trim() || null }),
    ...(dto.dueAt === undefined
      ? {}
      : { dueAt: dto.dueAt ? new Date(dto.dueAt) : existing.dueAt }),
    ...(dto.remindAt === undefined
      ? {}
      : { remindAt: dto.remindAt ? new Date(dto.remindAt) : null }),
    ...(dto.snoozedUntil === undefined
      ? {}
      : { snoozedUntil: dto.snoozedUntil ? new Date(dto.snoozedUntil) : null }),
  };
  const comparable = (value: unknown) =>
    value instanceof Date ? value.getTime() : value;
  return Object.fromEntries(
    Object.entries(candidates).filter(
      ([key, value]) =>
        comparable(existing[key as keyof TelegramAdvertiserTask]) !==
        comparable(value),
    ),
  ) as Prisma.TelegramAdvertiserTaskUncheckedUpdateInput;
}

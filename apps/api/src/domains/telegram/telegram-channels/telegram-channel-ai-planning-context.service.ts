import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramContentHypothesesService } from './telegram-content-hypotheses.service';

@Injectable()
export class TelegramChannelAiPlanningContextService {
  constructor(private readonly prisma: PrismaService, private readonly hypotheses: TelegramContentHypothesesService) {}

  async read(userId: string, workspaceId: string, channelId: string) {
    const [assignment, hypotheses] = await Promise.all([
      this.prisma.telegramChannelPublicationScheduleAssignment.findFirst({
        where: { workspaceId, channelId },
        select: {
          selectionMode: true,
          selectedSlots: { select: { slotId: true } },
          schedule: {
            select: {
              id: true,
              name: true,
              timezone: true,
              slots: {
                where: { isActive: true },
                select: {
                  id: true,
                  title: true,
                  kind: true,
                  weekday: true,
                  time: true,
                },
                orderBy: [{ weekday: 'asc' }, { position: 'asc' }],
              },
            },
          },
        },
      }),
      this.hypotheses.list(userId, channelId),
    ]);
    const selected = new Set(assignment?.selectedSlots.map((row) => row.slotId));
    const slots = assignment?.schedule.slots.filter(
      (slot) => assignment.selectionMode === 'FULL' || selected.has(slot.id),
    ) ?? [];
    return {
      schedule: assignment
        ? { ...assignment.schedule, selectionMode: assignment.selectionMode, slots }
        : null,
      hypotheses,
    };
  }

  formatSlots(context: Awaited<ReturnType<this['read']>>) {
    if (!context.schedule) return ['[] — no publication schedule is assigned'];
    return context.schedule.slots.map(
      (slot) =>
        `- slot_id: ${slot.id} — ${slot.title} — type: ${slot.kind} — weekday: ${slot.weekday} — time: ${slot.time} — timezone: ${context.schedule!.timezone}`,
    );
  }

  formatHypotheses(context: Awaited<ReturnType<this['read']>>) {
    if (!context.hypotheses.length) return ['[]'];
    return context.hypotheses.map(
      (item) =>
        `- hypothesis_id: ${item.id} — ${item.name} — status: ${item.status} — post_ids: ${item.postIds.join(',') || 'none'} — average_views: ${item.metrics.averageViews ?? 'unknown'} — reaction_rate_percent: ${item.metrics.averageReactionRate ?? 'unknown'} — comment_rate_percent: ${item.metrics.averageCommentRate ?? 'unknown'} — forward_rate_percent: ${item.metrics.averageForwardRate ?? 'unknown'} — observed_subscriber_delta: ${item.metrics.observedSubscriberDelta ?? 'unknown'} — theory: ${item.description || 'none'} — conclusion: ${item.conclusion || 'none'}`,
    );
  }
}

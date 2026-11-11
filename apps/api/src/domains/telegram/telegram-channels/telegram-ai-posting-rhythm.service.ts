import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramPostCalendarPlannerService } from './telegram-post-calendar-planner.service';
import { buildTelegramAiPostingRhythm } from './telegram-ai-posting-rhythm';

const LOOKBACK_MS = 28 * 24 * 60 * 60 * 1000;

@Injectable()
export class TelegramAiPostingRhythmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly planner: TelegramPostCalendarPlannerService,
  ) {}

  async suggest(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true, workspace: { select: { timezone: true } } },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: { postsPerDay: true },
    });
    if (!settings) throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
    const now = new Date();
    const rows = await this.prisma.telegramPostPerformance.findMany({
      where: {
        telegramPost: { telegramChannelId: channelId },
        publishedAt: { gte: new Date(now.getTime() - LOOKBACK_MS), lte: now },
      },
      orderBy: { publishedAt: 'desc' },
      take: 5_000,
      select: {
        publishedAt: true,
        publishHour: true,
        publishWeekday: true,
        origin: true,
      },
    });
    const timezone = channel.workspace?.timezone || 'UTC';
    const localRows = rows.map((row) => ({
      ...row,
      localDate: new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(
        row.publishedAt,
      ),
    }));
    return {
      ...buildTelegramAiPostingRhythm(localRows, now, timezone),
      timezone,
      currentPostsPerDay: settings.postsPerDay,
    };
  }

  async apply(userId: string, channelId: string) {
    const suggestion = await this.suggest(userId, channelId);
    const existing = await this.planner.listSlots(userId, channelId);
    const mutations = [
      ...existing.map((slot) => ({ action: 'DELETE' as const, slotId: slot.id })),
      ...Array.from({ length: 7 }, (_, weekday) =>
        suggestion.slots.map((time, position) => ({
          action: 'CREATE' as const,
          data: {
            weekday,
            time,
            position,
            timezone: suggestion.timezone,
            isActive: true,
          },
        })),
      ).flat(),
    ];
    for (let offset = 0; offset < mutations.length; offset += 100) {
      const result = await this.planner.mutateSlotsBatch(userId, channelId, {
        items: mutations.slice(offset, offset + 100),
      });
      if (result.failedCount)
        throw new Error('AI_POSTING_RHYTHM_SLOTS_APPLY_FAILED');
    }
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    await this.prisma.telegramAiPostingSettings.updateMany({
      where: { workspaceId, telegramChannelId: channelId },
      data: { postsPerDay: suggestion.postsPerDay },
    });
    return { ...suggestion, applied: true };
  }
}

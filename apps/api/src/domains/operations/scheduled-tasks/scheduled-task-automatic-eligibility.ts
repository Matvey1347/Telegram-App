import type { ScheduledTaskSchedule } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeNextRunAt } from './schedule-utils';

const CHANNEL_AUTO_SYNC_KEYS = [
  'telegram.channels.full_sync',
  'telegram.post_metrics.sync',
  'telegram.broadcast_stats.sync',
  'telegram.daily_analytics.sync',
];

export class ScheduledTaskAutomaticEligibility {
  constructor(private readonly prisma: PrismaService) {}

  async recover() {
    const configs = await this.prisma.scheduledTaskConfig.findMany({
      where: {
        taskKey: { in: CHANNEL_AUTO_SYNC_KEYS },
        workspaceId: { not: null },
      },
      select: { workspaceId: true },
      distinct: ['workspaceId'],
    });
    await Promise.all(
      configs.flatMap((config) =>
        config.workspaceId ? [this.refreshWorkspace(config.workspaceId)] : [],
      ),
    );
  }

  async refreshWorkspace(workspaceId: string) {
    const eligible = await this.prisma.telegramChannel.count({
      where: { workspaceId, isActive: true, autoSyncEnabled: true },
    });
    if (eligible) {
      const configs = await this.prisma.scheduledTaskConfig.findMany({
        where: {
          workspaceId,
          taskKey: { in: CHANNEL_AUTO_SYNC_KEYS },
          enabled: false,
          autoDisarmed: true,
        },
        select: { id: true, schedule: true },
      });
      await Promise.all(
        configs.map((config) =>
          this.prisma.scheduledTaskConfig.update({
            where: { id: config.id },
            data: {
              enabled: true,
              autoDisarmed: false,
              nextScheduledRunAt: computeNextRunAt(
                config.schedule as ScheduledTaskSchedule,
                new Date(),
              ),
            },
          }),
        ),
      );
      return;
    }
    await this.prisma.scheduledTaskConfig.updateMany({
      where: {
        workspaceId,
        taskKey: { in: CHANNEL_AUTO_SYNC_KEYS },
        enabled: true,
      },
      data: {
        enabled: false,
        autoDisarmed: true,
        nextScheduledRunAt: null,
        scheduledClaimOwner: null,
        scheduledClaimExpiresAt: null,
      },
    });
  }
}

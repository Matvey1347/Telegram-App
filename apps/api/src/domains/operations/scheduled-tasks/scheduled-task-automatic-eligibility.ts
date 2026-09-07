import type { ScheduledTaskSchedule } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { computeNextRunAt } from './schedule-utils';

const CHANNEL_AUTO_SYNC_KEYS = [
  'telegram.channels.full_sync',
  'telegram.post_metrics.sync',
  'telegram.broadcast_stats.sync',
  'telegram.daily_analytics.sync',
];
const CRM_SYNC_KEY = 'telegram.crm.sync';

export class ScheduledTaskAutomaticEligibility {
  constructor(private readonly prisma: PrismaService) {}

  async recover() {
    const configs = await this.prisma.scheduledTaskConfig.findMany({
      where: {
        taskKey: { in: [...CHANNEL_AUTO_SYNC_KEYS, CRM_SYNC_KEY] },
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
    const [eligibleChannels, eligibleCrmAccounts] = await Promise.all([
      this.prisma.telegramChannel.count({
        where: { workspaceId, isActive: true, autoSyncEnabled: true },
      }),
      this.prisma.telegramUserAccountIntegration.count({
        where: {
          workspaceId,
          isActive: true,
          status: 'connected',
          crmSyncEnabled: true,
        },
      }),
    ]);
    await this.refreshKeys(
      workspaceId,
      CHANNEL_AUTO_SYNC_KEYS,
      eligibleChannels > 0,
    );
    await this.refreshKeys(
      workspaceId,
      [CRM_SYNC_KEY],
      eligibleCrmAccounts > 0,
    );
  }

  private async refreshKeys(
    workspaceId: string,
    taskKeys: string[],
    eligible: boolean,
  ) {
    if (eligible) {
      const configs = await this.prisma.scheduledTaskConfig.findMany({
        where: {
          workspaceId,
          taskKey: { in: taskKeys },
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
        taskKey: { in: taskKeys },
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

import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApplicationLogsService } from '../application-logs/application-logs.service';
import { CurrenciesService } from '../../finance/currencies/currencies.service';
import { TelegramAdSalesService } from '../../telegram/telegram-ad-sales/telegram-ad-sales.service';
import { TelegramAdPlacementLifecycleService } from '../../telegram/telegram-ad-sales/telegram-ad-placement-lifecycle.service';
import { GreeterExpiryService } from '../../telegram/telegram-bots/greeter/greeter-expiry.service';
import { GreeterBroadcastService } from '../../telegram/telegram-bots/greeter/greeter-broadcast.service';
import { GreeterAutomationService } from '../../telegram/telegram-bots/greeter/greeter-automation.service';
import { OperationalHistoryRetentionService } from '../../telegram/telegram-bots/core/operational-history-retention.service';
import { DailyAnalyticsSyncService } from '../../telegram/telegram-sync/daily-analytics-sync.service';
import { TelegramWorkspaceFullSyncService } from '../../telegram/telegram-sync/telegram-workspace-full-sync.service';
import { TelegramWorkspaceSyncTasksService } from '../../telegram/telegram-sync/telegram-workspace-sync-tasks.service';
import { TelegramManagedPostReconciliationService } from '../../telegram/telegram-channels/telegram-managed-post-reconciliation.service';
import type {
  ScheduledTaskExecutionContext,
  ScheduledTaskExecutionResult,
} from './scheduled-task.types';

@Injectable()
export class ScheduledTaskExecutorService {
  constructor(private readonly moduleRef: ModuleRef) {}

  readonly executors = {
    'telegram.managed_posts.reconcile_due': async () => {
      const result = await (
        await this.telegramManagedPostReconciliationService()
      ).reconcileAllDueManagedPosts();
      return {
        summary: `Published ${result.localDelivery.published} locally scheduled managed posts; ${result.localDelivery.failed} failed. Checked ${result.checked} identities; verified ${result.verified}, missing ${result.missing}.`,
      };
    },
    'telegram.channels.full_sync': (context: ScheduledTaskExecutionContext) =>
      this.fullSyncService().then(async (service) => {
        const result = await service.syncWorkspace({
          workspaceId: this.requireWorkspace(context),
          actor: { type: 'SCHEDULED_TASK' },
        });
        return { summary: result.summary, details: result };
      }),
    'telegram.post_metrics.sync': (context: ScheduledTaskExecutionContext) =>
      this.telegramWorkspaceSyncTasks().then((service) =>
        service.syncPostMetricsForWorkspace(this.requireWorkspace(context)),
      ),
    'telegram.broadcast_stats.sync': (context: ScheduledTaskExecutionContext) =>
      this.telegramWorkspaceSyncTasks().then((service) =>
        service.syncBroadcastStatsForWorkspace(this.requireWorkspace(context)),
      ),
    'telegram.daily_analytics.sync': (context: ScheduledTaskExecutionContext) =>
      this.runDailyAnalytics(context),
    'currencies.rates.sync': (context: ScheduledTaskExecutionContext) =>
      this.currenciesService().then(async (service) => {
        const result = await service.syncRatesForWorkspaceTask(
          this.requireWorkspace(context),
        );
        return { summary: `Updated ${result.updated} exchange rates.` };
      }),
    'telegram_ad_sales.due_deletions': async () => {
      const lifecycle = this.moduleRef.get(
        TelegramAdPlacementLifecycleService,
        { strict: false },
      );
      const lifecycleResult = await lifecycle.reconcilePublishedPlacements();
      const result = await (
        await this.adSalesService()
      ).processDueDeletionBatch(20);
      return {
        summary: `Reconciled ${lifecycleResult.reconciled} published placements; processed ${result.processed} placements, ${result.failed} failed.`,
      };
    },
    'application_logs.cleanup': async () => {
      const result = await (
        await this.applicationLogsService()
      ).cleanupExpiredLogs();
      if (result.disabled) {
        return {
          summary: 'Application log retention is disabled.',
          skipped: true,
        };
      }
      return { summary: `Deleted ${result.deletedCount} expired logs.` };
    },
    'greeter.expire_pending': async () => {
      const result = await (
        await this.greeterExpiryService()
      ).processDueBatch(50);
      return {
        summary: `Processed ${result.processed} expired join requests, ${result.failed} failed.`,
      };
    },
    'greeter.broadcasts.dispatch': async () => {
      const result = await (
        await this.greeterBroadcastService()
      ).dispatchDue(10);
      return {
        summary: `Processed ${result.processed} due Greeter broadcasts.`,
      };
    },
    'greeter.automations.repair': async () => {
      const result = await (
        await this.greeterAutomationService()
      ).repairPendingExecutions(100);
      return {
        summary: `Repaired ${result.queued} Greeter executions, ${result.failed} failed.`,
      };
    },
    'operational_history.cleanup': async () => {
      const result = await (await this.retentionService()).cleanup();
      return {
        summary: `Deleted ${result.updateLogs} bot updates, ${result.deliveries} deliveries, ${result.scheduledTaskRuns} task runs, and ${result.systemBotUpdateLogs} system bot updates.`,
      };
    },
  } satisfies Record<
    string,
    (
      context: ScheduledTaskExecutionContext,
    ) => Promise<ScheduledTaskExecutionResult | void>
  >;

  private async runDailyAnalytics(context: ScheduledTaskExecutionContext) {
    type DailyAnalyticsResult = {
      channelsProcessed: number;
      campaignsProcessed: number;
      errorsCount: number;
    };
    const result = (await (
      await this.dailyAnalyticsSyncService()
    ).runDailyAnalyticsSync({
      workspaceId: this.requireWorkspace(context),
      source: context.trigger === 'MANUAL' ? 'manual' : 'cron',
    })) as DailyAnalyticsResult;
    return {
      summary: `Processed ${result.channelsProcessed} channels, ${result.campaignsProcessed} campaigns, ${result.errorsCount} errors.`,
    };
  }

  private requireWorkspace(context: ScheduledTaskExecutionContext) {
    if (!context.workspaceId) throw new Error('Workspace context is required');
    return context.workspaceId;
  }

  private telegramWorkspaceSyncTasks() {
    return this.moduleRef.resolve(
      TelegramWorkspaceSyncTasksService,
      undefined,
      {
        strict: false,
      },
    );
  }

  private telegramManagedPostReconciliationService() {
    return this.moduleRef.resolve(
      TelegramManagedPostReconciliationService,
      undefined,
      {
        strict: false,
      },
    );
  }

  private fullSyncService() {
    return this.moduleRef.resolve(TelegramWorkspaceFullSyncService, undefined, {
      strict: false,
    });
  }

  private greeterExpiryService() {
    return this.moduleRef.resolve(GreeterExpiryService, undefined, {
      strict: false,
    });
  }

  private greeterBroadcastService() {
    return this.moduleRef.resolve(GreeterBroadcastService, undefined, {
      strict: false,
    });
  }

  private greeterAutomationService() {
    return this.moduleRef.resolve(GreeterAutomationService, undefined, {
      strict: false,
    });
  }

  private retentionService() {
    return this.moduleRef.resolve(
      OperationalHistoryRetentionService,
      undefined,
      { strict: false },
    );
  }

  private dailyAnalyticsSyncService() {
    return this.moduleRef.resolve(DailyAnalyticsSyncService, undefined, {
      strict: false,
    });
  }

  private currenciesService() {
    return this.moduleRef.resolve(CurrenciesService, undefined, {
      strict: false,
    });
  }

  private adSalesService() {
    return this.moduleRef.resolve(TelegramAdSalesService, undefined, {
      strict: false,
    });
  }

  private applicationLogsService() {
    return this.moduleRef.resolve(ApplicationLogsService, undefined, {
      strict: false,
    });
  }
}

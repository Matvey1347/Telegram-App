import { ApplicationLogsService } from '../application-logs/application-logs.service';
import { CurrenciesService } from '../../finance/currencies/currencies.service';
import { TelegramAdSalesService } from '../../telegram/telegram-ad-sales/telegram-ad-sales.service';
import { GreeterExpiryService } from '../../telegram/telegram-bots/greeter/greeter-expiry.service';
import { GreeterBroadcastService } from '../../telegram/telegram-bots/greeter/greeter-broadcast.service';
import { GreeterAutomationService } from '../../telegram/telegram-bots/greeter/greeter-automation.service';
import { OperationalHistoryRetentionService } from '../../telegram/telegram-bots/core/operational-history-retention.service';
import { TelegramWorkspaceFullSyncService } from '../../telegram/telegram-sync/telegram-workspace-full-sync.service';
import { ScheduledTaskExecutorService } from './scheduled-task-executor.service';
import { ScheduledTaskRegistryService } from './scheduled-task-registry.service';
import { TelegramManagedPostReconciliationService } from '../../telegram/telegram-channels/telegram-managed-post-reconciliation.service';

describe('scheduled task registry executors', () => {
  function setup() {
    const fullSync = {
      syncWorkspace: jest.fn().mockResolvedValue({
        summary: 'Synced 3 channels: 2 successful, 1 failed.',
      }),
    };
    const greeter = {
      processDueBatch: jest
        .fn()
        .mockResolvedValue({ claimed: 4, processed: 3, failed: 1 }),
    };
    const broadcasts = {
      dispatchDue: jest.fn().mockResolvedValue({ processed: 2 }),
    };
    const automations = {
      repairPendingExecutions: jest.fn().mockResolvedValue({
        processed: 3,
        queued: 2,
        failed: 1,
      }),
    };
    const retention = {
      cleanup: jest.fn().mockResolvedValue({
        updateLogs: 1,
        deliveries: 2,
        scheduledTaskRuns: 3,
        systemBotUpdateLogs: 4,
      }),
    };
    const managedPosts = {
      reconcileAllDueManagedPosts: jest.fn().mockResolvedValue({
        checked: 3,
        verified: 2,
        missing: 1,
      }),
    };
    const services = new Map<unknown, unknown>([
      [TelegramWorkspaceFullSyncService, fullSync],
      [GreeterExpiryService, greeter],
      [GreeterBroadcastService, broadcasts],
      [GreeterAutomationService, automations],
      [OperationalHistoryRetentionService, retention],
      [CurrenciesService, {}],
      [TelegramAdSalesService, {}],
      [ApplicationLogsService, {}],
      [TelegramManagedPostReconciliationService, managedPosts],
    ]);
    const moduleRef = {
      resolve: jest.fn((token: unknown) =>
        Promise.resolve(services.get(token)),
      ),
    };
    const executor = new ScheduledTaskExecutorService(moduleRef as never);
    return {
      executor,
      fullSync,
      greeter,
      broadcasts,
      automations,
      retention,
      managedPosts,
    };
  }

  it('runs canonical workspace full sync with a scheduled actor', async () => {
    const { executor, fullSync } = setup();
    const result = await executor.executors['telegram.channels.full_sync']({
      taskKey: 'telegram.channels.full_sync',
      workspaceId: 'workspace-1',
      trigger: 'SCHEDULE',
    });
    expect(fullSync.syncWorkspace).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      actor: { type: 'SCHEDULED_TASK' },
    });
    expect(result).toMatchObject({
      summary: expect.stringContaining('2 successful'),
    });
  });

  it('reconciles only the bounded due managed-post queue', async () => {
    const { executor, managedPosts } = setup();
    const result =
      await executor.executors['telegram.managed_posts.reconcile_due']();
    expect(managedPosts.reconcileAllDueManagedPosts).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain('verified 2');
  });

  it('processes a bounded greeter expiry batch', async () => {
    const { executor, greeter } = setup();
    const result = await executor.executors['greeter.expire_pending']();
    expect(greeter.processDueBatch).toHaveBeenCalledWith(50);
    expect(result.summary).toContain('1 failed');
  });

  it('dispatches due Greeter broadcasts through persistent maintenance', async () => {
    const { executor, broadcasts } = setup();
    const result = await executor.executors['greeter.broadcasts.dispatch']();
    expect(broadcasts.dispatchDue).toHaveBeenCalledWith(10);
    expect(result.summary).toContain('2 due Greeter broadcasts');
  });

  it('repairs interrupted Greeter execution queueing', async () => {
    const { executor, automations } = setup();
    const result = await executor.executors['greeter.automations.repair']();
    expect(automations.repairPendingExecutions).toHaveBeenCalledWith(100);
    expect(result.summary).toContain('1 failed');
  });

  it('reports every operational retention result', async () => {
    const { executor, retention } = setup();
    const result = await executor.executors['operational_history.cleanup']();
    expect(retention.cleanup).toHaveBeenCalledTimes(1);
    expect(result.summary).toContain('3 task runs');
  });

  it('registers the required workspace and maintenance definitions', () => {
    const { executor } = setup();
    const definitions = new ScheduledTaskRegistryService(
      executor,
    ).definitions();
    const fullSync = definitions.find(
      (item) => item.key === 'telegram.channels.full_sync',
    );
    expect(fullSync).toMatchObject({
      scope: 'WORKSPACE_OPERATION',
      defaultSchedule: {
        frequency: 'DAILY',
        time: '00:00',
        timezone: 'Europe/Warsaw',
      },
      scheduleEditable: true,
      supportedFrequencies: ['DAILY'],
      notificationSupported: true,
      group: { key: 'TELEGRAM' },
    });
    expect(
      definitions.find((item) => item.key === 'telegram.post_metrics.sync'),
    ).toMatchObject({
      group: { key: 'TELEGRAM' },
      defaultSchedule: { frequency: 'INTERVAL', intervalMinutes: 120 },
    });
    expect(
      definitions.find((item) => item.key === 'greeter.expire_pending'),
    ).toMatchObject({ scope: 'SYSTEM_MAINTENANCE' });
    expect(
      definitions.find((item) => item.key === 'greeter.broadcasts.dispatch'),
    ).toMatchObject({ scope: 'SYSTEM_MAINTENANCE' });
    expect(
      definitions.find((item) => item.key === 'greeter.automations.repair'),
    ).toMatchObject({ scope: 'SYSTEM_MAINTENANCE' });
    expect(
      definitions.find((item) => item.key === 'operational_history.cleanup'),
    ).toMatchObject({ scope: 'SYSTEM_MAINTENANCE' });
  });
});

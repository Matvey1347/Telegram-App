import { Injectable } from '@nestjs/common';
import { ScheduledTaskExecutorService } from './scheduled-task-executor.service';
import type { ScheduledTaskDefinition } from './scheduled-task.types';

@Injectable()
export class ScheduledTaskRegistryService {
  constructor(private readonly executor: ScheduledTaskExecutorService) {}

  definitions(): ScheduledTaskDefinition[] {
    return [
      {
        key: 'telegram.managed_posts.reconcile_due',
        name: 'Telegram managed post identity reconciliation',
        description:
          'Verifies actual published Telegram identities for due scheduled managed posts.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 1,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        dueDriven: true,
        execute:
          this.executor.executors['telegram.managed_posts.reconcile_due'],
      },
      {
        key: 'telegram.channels.full_sync',
        group: {
          key: 'TELEGRAM',
          name: 'Telegram sync',
          description:
            'Independent Telegram synchronization tasks and notifications.',
        },
        name: 'Sync all Telegram channels',
        description:
          'Runs the canonical full sync for every active Telegram channel in the workspace.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '00:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.channels.full_sync'],
      },
      {
        key: 'telegram.post_metrics.sync',
        group: {
          key: 'TELEGRAM',
          name: 'Telegram sync',
          description:
            'Independent Telegram synchronization tasks and notifications.',
        },
        name: 'Telegram post metrics sync',
        description:
          'Refreshes post views, reactions and audience snapshots for workspace channels.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 120,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.post_metrics.sync'],
      },
      {
        key: 'telegram.broadcast_stats.sync',
        group: {
          key: 'TELEGRAM',
          name: 'Telegram sync',
          description:
            'Independent Telegram synchronization tasks and notifications.',
        },
        name: 'Telegram broadcast stats sync',
        description:
          'Downloads channel broadcast analytics from connected MTProto admin accounts.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '04:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.broadcast_stats.sync'],
      },
      {
        key: 'telegram.daily_analytics.sync',
        group: {
          key: 'TELEGRAM',
          name: 'Telegram sync',
          description:
            'Independent Telegram synchronization tasks and notifications.',
        },
        name: 'Daily analytics sync',
        description:
          'Creates audience snapshots and recalculates campaign analytics for the workspace.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '05:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['telegram.daily_analytics.sync'],
      },
      {
        key: 'currencies.rates.sync',
        name: 'Currency rates sync',
        description:
          'Fetches exchange rates for the workspace primary currency.',
        scope: 'WORKSPACE_OPERATION',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '03:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: true,
        supportedFrequencies: ['DAILY'],
        notificationSupported: true,
        execute: this.executor.executors['currencies.rates.sync'],
      },
      {
        key: 'telegram_ad_sales.due_deletions',
        name: 'Ad sales due deletions',
        description:
          'Processes due deletion of published Telegram ad placements.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 15,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        dueDriven: true,
        execute: this.executor.executors['telegram_ad_sales.due_deletions'],
      },
      {
        key: 'telegram_crm.customer_automations',
        name: 'CRM customer automation delivery',
        description:
          'Claims and sends only persisted due CRM customer automation occurrences.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 60,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        dueDriven: true,
        execute: this.executor.executors['telegram_crm.customer_automations'],
      },
      {
        key: 'application_logs.cleanup',
        name: 'Application logs cleanup',
        description:
          'Deletes expired application logs according to retention settings.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '00:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['DAILY'],
        notificationSupported: false,
        execute: this.executor.executors['application_logs.cleanup'],
      },
      {
        key: 'greeter.expire_pending',
        name: 'Greeter pending request expiry',
        description: 'Expires due Greeter CAPTCHA join requests safely.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 1,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        dueDriven: true,
        execute: this.executor.executors['greeter.expire_pending'],
      },
      {
        key: 'greeter.broadcasts.dispatch',
        name: 'Greeter broadcast dispatcher',
        description: 'Materializes and queues due Greeter broadcasts durably.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 1,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        dueDriven: true,
        execute: this.executor.executors['greeter.broadcasts.dispatch'],
      },
      {
        key: 'greeter.automations.repair',
        name: 'Greeter automation repair',
        description:
          'Queues recoverable Greeter step executions after interrupted enrollment.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'INTERVAL',
          intervalMinutes: 1,
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['INTERVAL'],
        notificationSupported: false,
        dueDriven: true,
        execute: this.executor.executors['greeter.automations.repair'],
      },
      {
        key: 'operational_history.cleanup',
        name: 'Operational history cleanup',
        description: 'Deletes expired terminal scheduler and bot history.',
        scope: 'SYSTEM_MAINTENANCE',
        defaultSchedule: {
          frequency: 'DAILY',
          time: '01:00',
          timezone: 'Europe/Warsaw',
        },
        scheduleEditable: false,
        supportedFrequencies: ['DAILY'],
        notificationSupported: false,
        execute: this.executor.executors['operational_history.cleanup'],
      },
    ];
  }

  get(key: string) {
    return (
      this.definitions().find((definition) => definition.key === key) ?? null
    );
  }
}

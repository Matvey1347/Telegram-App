import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

export function notifyManagedPostSchedulePersisted<T>(
  persisted: T,
  scheduleAt?: Date,
  hasAdSalePlacement = false,
  hasAutoDelete = false,
) {
  if (scheduleAt || hasAutoDelete) {
    notifyScheduledTaskDueWorkChanged('telegram.managed_posts.reconcile_due');
  }
  if (!scheduleAt && hasAdSalePlacement) {
    notifyScheduledTaskDueWorkChanged('telegram_ad_sales.due_deletions');
  }
  return persisted;
}

import { EventEmitter } from 'node:events';

/**
 * In-process notification only. The database remains the source of truth on
 * restart; this merely re-arms the current process after a domain mutation.
 */
export const scheduledTaskWakeNotifier = new EventEmitter();

export function notifyScheduledTaskDueWorkChanged(taskKey: string) {
  scheduledTaskWakeNotifier.emit('changed', taskKey);
}

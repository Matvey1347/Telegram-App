import { EventEmitter } from 'node:events';

/**
 * Neutral in-process due-work signal. The database remains authoritative on
 * restart; this only asks the current process to recompute its one-shot wake.
 */
export const scheduledTaskWakeNotifier = new EventEmitter();

export function notifyScheduledTaskDueWorkChanged(taskKey: string) {
  scheduledTaskWakeNotifier.emit('changed', taskKey);
}

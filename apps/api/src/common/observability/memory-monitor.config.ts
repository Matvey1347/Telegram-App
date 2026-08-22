export const MEMORY_MONITOR_CONFIG = {
  intervalMs: 30_000,
  defaultWarningRssMb: 400,
  recoveryRatio: 0.9,
  reminderIntervalMs: 15 * 60_000,
} as const;

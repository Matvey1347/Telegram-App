export const APPLICATION_LOGGING_CONFIG = {
  batchSize: 50,
  flushIntervalMs: 1_000,
  retentionDays: 30,
  slowRequestMs: 0,
  storageProbeIntervalMs: 5_000,
} as const;

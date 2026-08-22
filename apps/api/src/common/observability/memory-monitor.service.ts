import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  deploymentFlag,
  positiveDeploymentNumber,
} from '../../config/deployment-config';
import { MEMORY_MONITOR_CONFIG } from './memory-monitor.config';

export type MemoryMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

@Injectable()
export class MemoryMonitorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('MemoryMonitor');
  private readonly enabled =
    deploymentFlag('MEMORY_MONITOR_ENABLED') !== 'false';
  private readonly intervalMs = MEMORY_MONITOR_CONFIG.intervalMs;
  private readonly warnRssMb = positiveDeploymentNumber(
    'MEMORY_MONITOR_WARN_RSS_MB',
    MEMORY_MONITOR_CONFIG.defaultWarningRssMb,
  );
  private readonly recoveryRssMb =
    this.warnRssMb * MEMORY_MONITOR_CONFIG.recoveryRatio;
  private readonly reminderIntervalMs =
    MEMORY_MONITOR_CONFIG.reminderIntervalMs;
  // Detailed samples are useful during an investigation, but must be opt-in:
  // Nest's production logger can persist ordinary logs to ApplicationLog.
  private readonly detailedTelemetry =
    deploymentFlag('MEMORY_MONITOR_DETAILED_TELEMETRY') === 'true';
  private timer?: NodeJS.Timeout;
  private warningActive = false;
  private lastWarningAt = 0;

  onApplicationBootstrap(): void {
    if (!this.enabled) return;

    if (this.detailedTelemetry) this.logMemory('application_started');

    this.timer = setInterval(() => {
      this.logMemory('interval');
    }, this.intervalMs);

    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  logMemory(event: string, metadata: MemoryMetadata = {}): void {
    const memory = process.memoryUsage();

    const payload = {
      event,
      rssMb: this.toMb(memory.rss),
      heapUsedMb: this.toMb(memory.heapUsed),
      heapTotalMb: this.toMb(memory.heapTotal),
      externalMb: this.toMb(memory.external),
      arrayBuffersMb: this.toMb(memory.arrayBuffers),
      uptimeSeconds: Math.round(process.uptime()),
      ...metadata,
    };

    if (payload.rssMb >= this.warnRssMb) {
      const now = Date.now();
      if (!this.warningActive) {
        this.warningActive = true;
        this.lastWarningAt = now;
        this.logger.warn(
          JSON.stringify({
            ...payload,
            event: 'rss_warning',
            sampleEvent: event,
          }),
        );
      } else if (now - this.lastWarningAt >= this.reminderIntervalMs) {
        this.lastWarningAt = now;
        this.logger.warn(
          JSON.stringify({
            ...payload,
            event: 'rss_warning_reminder',
            sampleEvent: event,
          }),
        );
      }
      return;
    }

    if (this.warningActive && payload.rssMb <= this.recoveryRssMb) {
      this.warningActive = false;
      this.lastWarningAt = 0;
      this.logger.warn(
        JSON.stringify({
          ...payload,
          event: 'rss_recovered',
          sampleEvent: event,
          warningThresholdMb: this.warnRssMb,
          recoveryThresholdMb: this.recoveryRssMb,
        }),
      );
      return;
    }

    if (this.detailedTelemetry || event !== 'interval') {
      this.logger.log(JSON.stringify(payload));
    }
  }

  async track<T>(
    operation: string,
    metadata: MemoryMetadata,
    callback: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now();
    const before = process.memoryUsage();

    if (this.detailedTelemetry) {
      this.logMemory('operation_started', { operation, ...metadata });
    }

    try {
      return await callback();
    } finally {
      const after = process.memoryUsage();

      if (this.detailedTelemetry) {
        this.logMemory('operation_finished', {
          operation,
          durationMs: Date.now() - startedAt,
          rssDeltaMb: this.toMb(after.rss - before.rss),
          heapUsedDeltaMb: this.toMb(after.heapUsed - before.heapUsed),
          externalDeltaMb: this.toMb(after.external - before.external),
          arrayBuffersDeltaMb: this.toMb(
            after.arrayBuffers - before.arrayBuffers,
          ),
          ...metadata,
        });
      }
    }
  }

  private toMb(bytes: number): number {
    return Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
}

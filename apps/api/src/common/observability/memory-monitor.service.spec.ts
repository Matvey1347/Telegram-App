/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import { Logger } from '@nestjs/common';
import { MemoryMonitorService } from './memory-monitor.service';

const MB = 1024 * 1024;

describe('MemoryMonitorService', () => {
  const originalUptime = process.uptime;
  const originalWarnThreshold = process.env.MEMORY_MONITOR_WARN_RSS_MB;
  const originalRecoveryThreshold = process.env.MEMORY_MONITOR_RECOVERY_RSS_MB;
  const originalReminderInterval =
    process.env.MEMORY_MONITOR_REMINDER_INTERVAL_MS;
  const originalDetailedTelemetry =
    process.env.MEMORY_MONITOR_DETAILED_TELEMETRY;

  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let memoryUsageSpy: jest.SpyInstance;
  let nowSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    memoryUsageSpy = jest.spyOn(process, 'memoryUsage');
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    process.uptime = jest.fn(() => 12.4);
    process.env.MEMORY_MONITOR_WARN_RSS_MB = '400';
    process.env.MEMORY_MONITOR_RECOVERY_RSS_MB = '360';
    process.env.MEMORY_MONITOR_REMINDER_INTERVAL_MS = '900000';
    process.env.MEMORY_MONITOR_DETAILED_TELEMETRY = 'true';
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    memoryUsageSpy.mockRestore();
    nowSpy.mockRestore();
    process.uptime = originalUptime;
    if (originalWarnThreshold === undefined) {
      delete process.env.MEMORY_MONITOR_WARN_RSS_MB;
    } else {
      process.env.MEMORY_MONITOR_WARN_RSS_MB = originalWarnThreshold;
    }
    if (originalDetailedTelemetry === undefined) {
      delete process.env.MEMORY_MONITOR_DETAILED_TELEMETRY;
    } else {
      process.env.MEMORY_MONITOR_DETAILED_TELEMETRY = originalDetailedTelemetry;
    }
    if (originalRecoveryThreshold === undefined) {
      delete process.env.MEMORY_MONITOR_RECOVERY_RSS_MB;
    } else {
      process.env.MEMORY_MONITOR_RECOVERY_RSS_MB = originalRecoveryThreshold;
    }
    if (originalReminderInterval === undefined) {
      delete process.env.MEMORY_MONITOR_REMINDER_INTERVAL_MS;
    } else {
      process.env.MEMORY_MONITOR_REMINDER_INTERVAL_MS =
        originalReminderInterval;
    }
  });

  it('logs memory usage as structured JSON below the warning threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: 256 * MB,
      heapTotal: 90.25 * MB,
      heapUsed: 64.12 * MB,
      external: 8 * MB,
      arrayBuffers: 2.5 * MB,
    });

    new MemoryMonitorService().logMemory('manual_check', {
      operation: 'import',
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toEqual({
      event: 'manual_check',
      rssMb: 256,
      heapUsedMb: 64.1,
      heapTotalMb: 90.3,
      externalMb: 8,
      arrayBuffersMb: 2.5,
      uptimeSeconds: 12,
      operation: 'import',
    });
  });

  it('warns only when RSS crosses the configured threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: 401 * MB,
      heapTotal: 110 * MB,
      heapUsed: 88 * MB,
      external: 12 * MB,
      arrayBuffers: 4 * MB,
    });

    const monitor = new MemoryMonitorService();
    monitor.logMemory('interval');
    monitor.logMemory('interval');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warnSpy.mock.calls[0][0] as string)).toMatchObject({
      event: 'rss_warning',
      sampleEvent: 'interval',
      rssMb: 401,
    });
  });

  it('throttles reminders while RSS remains above the threshold', () => {
    memoryUsageSpy.mockReturnValue({
      rss: 450 * MB,
      heapTotal: 110 * MB,
      heapUsed: 88 * MB,
      external: 12 * MB,
      arrayBuffers: 4 * MB,
    });
    const monitor = new MemoryMonitorService();

    monitor.logMemory('interval');
    nowSpy.mockReturnValue(1_000_000 + 899_999);
    monitor.logMemory('interval');
    nowSpy.mockReturnValue(1_000_000 + 900_000);
    monitor.logMemory('interval');

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(warnSpy.mock.calls[1][0] as string)).toMatchObject({
      event: 'rss_warning_reminder',
      rssMb: 450,
    });
  });

  it('logs recovery once and uses hysteresis around the warning threshold', () => {
    const monitor = new MemoryMonitorService();
    memoryUsageSpy
      .mockReturnValueOnce({
        rss: 410 * MB,
        heapTotal: 110 * MB,
        heapUsed: 88 * MB,
        external: 12 * MB,
        arrayBuffers: 4 * MB,
      })
      .mockReturnValueOnce({
        rss: 380 * MB,
        heapTotal: 100 * MB,
        heapUsed: 75 * MB,
        external: 10 * MB,
        arrayBuffers: 3 * MB,
      })
      .mockReturnValue({
        rss: 350 * MB,
        heapTotal: 95 * MB,
        heapUsed: 70 * MB,
        external: 9 * MB,
        arrayBuffers: 2 * MB,
      });

    monitor.logMemory('interval');
    monitor.logMemory('interval');
    monitor.logMemory('interval');
    monitor.logMemory('interval');

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(warnSpy.mock.calls[1][0] as string)).toMatchObject({
      event: 'rss_recovered',
      rssMb: 350,
      recoveryThresholdMb: 360,
    });
  });

  it('does not emit normal interval telemetry unless detailed telemetry is enabled', () => {
    process.env.MEMORY_MONITOR_DETAILED_TELEMETRY = 'false';
    memoryUsageSpy.mockReturnValue({
      rss: 256 * MB,
      heapTotal: 90 * MB,
      heapUsed: 64 * MB,
      external: 8 * MB,
      arrayBuffers: 2 * MB,
    });

    new MemoryMonitorService().logMemory('interval');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

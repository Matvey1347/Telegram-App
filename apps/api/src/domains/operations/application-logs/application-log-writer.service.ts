import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  Prisma,
  type ApplicationLogKind,
  type ApplicationLogLevel,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { isApplicationLogStorageMissing } from './application-logs-storage';

type ApplicationLogWriteInput = {
  workspaceId?: string | null;
  userId?: string | null;
  level: ApplicationLogLevel;
  kind: ApplicationLogKind;
  environment: string;
  service: string;
  source?: string | null;
  event: string;
  message: string;
  correlationId?: string | null;
  requestId?: string | null;
  method?: string | null;
  endpoint?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  errorName?: string | null;
  errorCode?: string | null;
  stack?: string | null;
  metadata?: Record<string, unknown> | null;
  expiresAt?: Date | null;
};

const PRIORITY: Record<ApplicationLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

@Injectable()
export class ApplicationLogWriterService implements OnModuleDestroy {
  private queue: ApplicationLogWriteInput[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private storageState: 'unknown' | 'available' | 'missing' = 'unknown';
  private nextStorageProbeAt = 0;
  private destroying = false;
  private readonly batchSize = Math.max(
    1,
    Number(process.env.APP_LOG_BATCH_SIZE || 50),
  );
  private readonly flushIntervalMs = Math.max(
    200,
    Number(process.env.APP_LOG_FLUSH_INTERVAL_MS || 1000),
  );
  private readonly maxQueueSize = Math.max(this.batchSize * 10, 500);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleDestroy() {
    this.destroying = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    await this.flush(true);
  }

  enqueue(entry: ApplicationLogWriteInput) {
    if (this.queue.length >= this.maxQueueSize) {
      const firstLowPriorityIndex = this.queue.findIndex(
        (item) => PRIORITY[item.level] < PRIORITY.warn,
      );
      if (PRIORITY[entry.level] < PRIORITY.warn) {
        console.warn(
          `[ApplicationLogWriter] dropped low-priority log event=${entry.event}`,
        );
        return;
      }
      if (firstLowPriorityIndex >= 0) {
        this.queue.splice(firstLowPriorityIndex, 1);
      } else {
        this.queue.shift();
      }
    }

    this.queue.push(entry);
    if (this.queue.length >= this.batchSize) {
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = null;
      void this.flush(true);
    } else {
      this.scheduleFlush();
    }
  }

  async flush(force = false) {
    if (
      this.storageState === 'missing' &&
      Date.now() < this.nextStorageProbeAt
    ) {
      this.queue.length = 0;
      return;
    }
    if (this.flushing) return;
    if (!this.queue.length) return;
    if (!force && this.queue.length < this.batchSize) return;

    this.flushing = true;
    const batch = this.queue.splice(0, this.batchSize);
    try {
      await this.prisma.applicationLog.createMany({
        data: batch.map((entry) => ({
          ...entry,
          metadata:
            entry.metadata == null
              ? undefined
              : (entry.metadata as Prisma.InputJsonValue),
        })),
      });
      this.storageState = 'available';
    } catch (error) {
      if (isApplicationLogStorageMissing(error)) {
        this.storageState = 'missing';
        this.nextStorageProbeAt = Date.now() + 5000;
        this.queue.length = 0;
        return;
      }
      console.error(
        '[ApplicationLogWriter] failed to persist logs',
        error instanceof Error ? error.message : error,
      );
    } finally {
      this.flushing = false;
      if (force && this.queue.length) {
        if (this.queue.length >= this.batchSize || this.destroying) {
          await this.flush(true);
        } else {
          this.scheduleFlush();
        }
      }
    }
  }

  private scheduleFlush() {
    if (this.destroying || this.flushTimer || !this.queue.length) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush(true);
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }
}

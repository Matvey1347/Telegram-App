import { Injectable } from '@nestjs/common';
import {
  ScheduledTaskRunStatus,
  TelegramBotDeliveryStatus,
  TelegramBotUpdateStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { OPERATIONAL_HISTORY_RETENTION_CONFIG } from './operational-history-retention.config';

const DAY_MS = 24 * 60 * 60_000;

@Injectable()
export class OperationalHistoryRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanup(now = new Date()) {
    const botCutoff = this.cutoff(
      now,
      OPERATIONAL_HISTORY_RETENTION_CONFIG.telegramBotDays,
    );
    const taskCutoff = this.cutoff(
      now,
      OPERATIONAL_HISTORY_RETENTION_CONFIG.scheduledTaskRunDays,
    );
    const [updates, deliveries, taskRuns, systemBotUpdates] = await Promise.all(
      [
        this.prisma.telegramBotUpdateLog.deleteMany({
          where: {
            createdAt: { lt: botCutoff },
            status: {
              in: [
                TelegramBotUpdateStatus.PROCESSED,
                TelegramBotUpdateStatus.SKIPPED,
                TelegramBotUpdateStatus.FAILED,
                TelegramBotUpdateStatus.DUPLICATE,
              ],
            },
          },
        }),
        this.prisma.telegramBotDelivery.deleteMany({
          where: {
            createdAt: { lt: botCutoff },
            status: {
              in: [
                TelegramBotDeliveryStatus.SENT,
                TelegramBotDeliveryStatus.FAILED,
                TelegramBotDeliveryStatus.CANCELLED,
              ],
            },
          },
        }),
        this.prisma.scheduledTaskRun.deleteMany({
          where: {
            finishedAt: { lt: taskCutoff },
            status: {
              in: [
                ScheduledTaskRunStatus.SUCCESS,
                ScheduledTaskRunStatus.FAILED,
                ScheduledTaskRunStatus.SKIPPED,
              ],
            },
          },
        }),
        this.prisma.telegramSystemBotUpdateLog.deleteMany({
          where: {
            createdAt: { lt: botCutoff },
            status: { in: ['PROCESSED', 'FAILED'] },
          },
        }),
      ],
    );
    return {
      updateLogs: updates.count,
      deliveries: deliveries.count,
      scheduledTaskRuns: taskRuns.count,
      systemBotUpdateLogs: systemBotUpdates.count,
    };
  }

  private cutoff(now: Date, days: number) {
    return new Date(now.getTime() - days * DAY_MS);
  }
}

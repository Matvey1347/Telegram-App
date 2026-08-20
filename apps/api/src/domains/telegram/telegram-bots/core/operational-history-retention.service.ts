import { Injectable } from '@nestjs/common';
import {
  ScheduledTaskRunStatus,
  TelegramBotDeliveryStatus,
  TelegramBotUpdateStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60_000;

@Injectable()
export class OperationalHistoryRetentionService {
  constructor(private readonly prisma: PrismaService) {}

  async cleanup(now = new Date()) {
    const botCutoff = this.cutoff(
      now,
      'TELEGRAM_OPERATIONAL_HISTORY_RETENTION_DAYS',
      30,
    );
    const taskCutoff = this.cutoff(
      now,
      'SCHEDULED_TASK_RUN_RETENTION_DAYS',
      90,
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

  private cutoff(now: Date, variable: string, fallbackDays: number) {
    const configured = Number(process.env[variable] ?? fallbackDays);
    const days =
      Number.isFinite(configured) && configured > 0 ? configured : fallbackDays;
    return new Date(now.getTime() - days * DAY_MS);
  }
}

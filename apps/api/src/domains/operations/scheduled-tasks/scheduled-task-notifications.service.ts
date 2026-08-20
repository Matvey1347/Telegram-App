import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';

@Injectable()
export class ScheduledTaskNotificationsService {
  private readonly logger = new Logger(ScheduledTaskNotificationsService.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async notify(params: {
    taskKey: string;
    taskName: string;
    workspaceId: string | null;
    runId: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    resultSummary: string | null;
    durationMs: number | null;
    failureReason: string | null;
    details?: unknown;
    enabled: boolean;
  }) {
    if (!params.enabled) return { status: 'DISABLED' as const };
    try {
      const service = await this.moduleRef.resolve(
        TelegramSystemBotNotificationsService,
        undefined,
        { strict: false },
      );
      return service.notify({
        taskKey: params.taskKey,
        taskName: params.taskName,
        workspaceId: params.workspaceId,
        runId: params.runId,
        status: params.status,
        resultSummary: params.resultSummary,
        durationMs: params.durationMs ?? 0,
        errorReason: params.failureReason,
        details: params.details,
      });
    } catch (error) {
      this.logger.warn(
        `System bot notification dispatch failed: ${sanitizeOperationalError(error)}`,
      );
      return { status: 'NOT_CONFIGURED' as const };
    }
  }
}

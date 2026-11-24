import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiPostingAutopilotNotificationsService } from '../../operations/notifications/ai-posting-autopilot-notifications.service';
import { classifyAutopilotError } from './telegram-ai-posting-autopilot-error';

type RunNotificationSummary = {
  coverageDays: number;
  targetCoverageDays: number;
  criticalDraftThreshold: number;
  readyDrafts: number;
  generated: number;
  scheduledInWindow: number;
  errors: string[];
  scheduleMode: string;
  scheduled?: number;
  scheduledThrough?: string | null;
  channelTitle?: string;
  timezone?: string;
  costs?: Record<string, string>;
  unknownCosts?: number;
  spheres?: string[];
  rubrics?: string[];
};

@Injectable()
export class TelegramAiPostingAutopilotNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async emitRunSummary(
    workspaceId: string,
    channelId: string,
    runId: string,
    result: RunNotificationSummary,
  ) {
    const service = await this.moduleRef.resolve(
      AiPostingAutopilotNotificationsService,
      undefined,
      { strict: false },
    );
    try {
      if (result.coverageDays < result.targetCoverageDays)
        await service.notify({
          workspaceId,
          channelId,
          runId,
          event: 'LOW_SCHEDULE_COVERAGE',
          title: 'Низкое покрытие расписания',
          body: `Покрытие составляет ${result.coverageDays} дней.`,
          metadata: { coverageDays: result.coverageDays },
        });
      if (result.readyDrafts < result.criticalDraftThreshold)
        await service.notify({
          workspaceId,
          channelId,
          runId,
          event: 'CRITICAL_DRAFT_STOCK',
          title: 'Критически малый запас черновиков',
          body: `Готовых черновиков осталось ${result.readyDrafts}.`,
          metadata: { readyDrafts: result.readyDrafts },
          priority: 'HIGH',
        });
      if (result.errors.some((error) => /GENERATION|IMAGE/.test(error)))
        await service.notify({
          workspaceId,
          channelId,
          runId,
          event: 'GENERATION_OR_IMAGE_FAILURE',
          title: 'Ошибка генерации AI Posting',
          body: 'Часть черновиков не удалось подготовить. Запуск сохранён для проверки.',
          metadata: { errorCount: result.errors.length },
          priority: 'HIGH',
        });
      if (result.errors.some((error) => /AI_API|BUDGET|QUOTA/.test(error)))
        await service.notify({
          workspaceId,
          channelId,
          runId,
          event: 'AI_API_OR_BUDGET_FAILURE',
          title: 'AI API недоступен или исчерпана квота',
          body: 'Часть задач генерации не выполнена. Запуск сохранён для проверки.',
          metadata: { errorCount: result.errors.length },
          priority: 'HIGH',
        });
      if (
        result.errors.some((error) => /PLANNING|PUBLICATION|SLOT/.test(error))
      )
        await service.notify({
          workspaceId,
          channelId,
          runId,
          event: 'PLANNING_OR_PUBLICATION_FAILURE',
          title: 'Ошибка планирования AI Posting',
          body: 'Не удалось заполнить часть календарных слотов. Запуск сохранён для проверки.',
          metadata: { errorCount: result.errors.length },
          priority: 'HIGH',
        });
      const labels: Record<string, string> = { planning: 'планирование', text: 'текст', search: 'проверка найденных изображений', image: 'генерация изображений', review: 'редакторская проверка' };
      const costs = Object.entries(result.costs ?? {});
      const total = costs.reduce((sum, [, cost]) => sum.plus(cost), new Prisma.Decimal(0));
      const through = result.scheduledThrough && new Intl.DateTimeFormat('ru-RU', {
        timeZone: result.timezone ?? 'Europe/Warsaw', dateStyle: 'medium', timeStyle: 'short',
      }).format(new Date(result.scheduledThrough));
      const body = [
        `Создано черновиков: ${result.generated}. Запланировано публикаций: ${result.scheduled ?? 0}.`,
        through ? `Крайний заполненный слот: ${through} (${result.timezone ?? 'Europe/Warsaw'}).` : '',
        `Покрытие без пропусков: ${result.coverageDays} дн. Готовый запас: ${result.readyDrafts}.`,
        result.spheres?.length ? `Сферы: ${result.spheres.join(', ')}.` : '',
        result.rubrics?.length ? `Рубрики: ${result.rubrics.join(', ')}.` : '',
        costs.length ? `Подтверждённый расход: $${total}. ${costs.map(([key, cost]) => `${labels[key] ?? key} $${cost}`).join(', ')}.` : '',
        result.unknownCosts ? `Операций с неподтверждённой стоимостью: ${result.unknownCosts}.` : '',
      ].filter(Boolean).join('\n');
      await service.notify({
        workspaceId,
        channelId,
        runId,
        event: 'WEEKLY_REPORT',
        title: `AI Posting · ${result.channelTitle || 'Автопилот'}`,
        body,
        metadata: {
          coverageDays: result.coverageDays,
          readyDrafts: result.readyDrafts,
          scheduled: result.scheduled ?? 0,
          scheduleMode: result.scheduleMode,
        },
      });
    } catch (error) {
      await this.recordNotificationFailure(
        runId,
        classifyAutopilotError(error),
      );
    }
  }

  async emitRunFailure(
    workspaceId: string,
    channelId: string,
    runId: string,
    errorType: string,
  ) {
    const service = await this.moduleRef.resolve(
      AiPostingAutopilotNotificationsService,
      undefined,
      { strict: false },
    );
    const event =
      errorType.includes('BUDGET') ||
      errorType.includes('AI_API') ||
      errorType.includes('QUOTA')
        ? 'AI_API_OR_BUDGET_FAILURE'
        : errorType.includes('IMAGE')
          ? 'GENERATION_OR_IMAGE_FAILURE'
          : 'PLANNING_OR_PUBLICATION_FAILURE';
    await service.notify({
      workspaceId,
      channelId,
      runId,
      event,
      title: 'Сбой Content Autopilot',
      body: 'Запуск завершился ошибкой. Детали доступны в истории запусков.',
      metadata: { errorType },
      priority: 'HIGH',
    });
  }

  private async recordNotificationFailure(runId: string, errorType: string) {
    try {
      await this.prisma.telegramAiPostingAutopilotStage.create({
        data: {
          runId,
          stage: 'NOTIFICATIONS',
          status: 'FAILED',
          attempt: 1,
          completedAt: new Date(),
          errorType,
          errorMessage: errorType,
        },
      });
    } catch {
      // Keep the channel worker moving even if audit persistence is unavailable.
    }
  }
}

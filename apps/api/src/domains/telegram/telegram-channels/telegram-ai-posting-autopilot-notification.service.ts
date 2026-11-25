import { readAutopilotRunCosts } from './telegram-ai-posting-autopilot-costs';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiPostingAutopilotNotificationsService } from '../../operations/notifications/ai-posting-autopilot-notifications.service';
import { classifyAutopilotError } from './telegram-ai-posting-autopilot-error';

import {
  autopilotReportLines,
  publicationNotificationChannel,
  publicationNotificationChannelSelect,
  publicationNotificationHtml,
} from '../../operations/notifications/publication-notification-message';

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
  costBreakdown?: Awaited<ReturnType<typeof readAutopilotRunCosts>>['costBreakdown'];
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
      const costs = Object.values(result.costs ?? {});
      const total = costs.reduce(
        (sum, cost) => sum.plus(cost),
        new Prisma.Decimal(0),
      );
      const channel = await this.reportChannel(
        workspaceId,
        channelId,
        result.channelTitle,
      );
      const lines = autopilotReportLines(channel, {
        generated: result.generated,
        scheduled: result.scheduled ?? 0,
        coverageDays: result.coverageDays,
        readyDrafts: result.readyDrafts,
        errorCount: result.errors.length,
        totalCost: costs.length || (result.costBreakdown && !result.unknownCosts) ? total.toString() : null,
        unknownCosts: result.unknownCosts,
        costBreakdown: result.costBreakdown,
      });
      await service.notify({
        workspaceId,
        channelId,
        runId,
        event: 'WEEKLY_REPORT',
        destination: await this.destination(
          workspaceId,
          result.errors.length > 0,
        ),
        ...(result.errors.length ? { priority: 'HIGH' as const } : {}),
        title: channel.title,
        body: lines
          .slice(1)
          .map(({ text }) => text)
          .join('\n'),
        metadata: {
          coverageDays: result.coverageDays,
          readyDrafts: result.readyDrafts,
          scheduled: result.scheduled ?? 0,
          scheduleMode: result.scheduleMode,
          telegramHtml: publicationNotificationHtml(lines),
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
    const channel = await this.reportChannel(workspaceId, channelId);
    const receipt = await readAutopilotRunCosts(this.prisma, workspaceId, channelId, runId).catch(() => null);
    const totalCost = receipt ? Object.values(receipt.costs).reduce((sum, cost) => sum.plus(cost), new Prisma.Decimal(0)).toString() : null;
    const lines = autopilotReportLines(channel, {
      generated: 0, scheduled: 0, coverageDays: null, readyDrafts: 0, errorCount: 1,
      totalCost, unknownCosts: receipt?.unknownCosts, costBreakdown: receipt?.costBreakdown,
    });
    await service.notify({
      workspaceId,
      channelId,
      runId,
      event,
      destination: await this.destination(workspaceId, true),
      title: channel.title,
      body: lines.slice(1).map(({ text }) => text).join('\n'),
      metadata: {
        errorType,
        telegramHtml: publicationNotificationHtml(lines),
      },
      priority: 'HIGH',
    });
  }

  private async destination(workspaceId: string, failure: boolean) {
    const settings = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        autopilotNotificationDestination: true,
        autopilotErrorNotificationDestination: true,
      },
    });
    return failure
      ? settings.autopilotErrorNotificationDestination
      : settings.autopilotNotificationDestination;
  }

  private async reportChannel(
    workspaceId: string,
    id: string,
    fallback = 'Канал',
  ) {
    const row = await this.prisma.telegramChannel.findFirst({
      where: { workspaceId, id },
      select: publicationNotificationChannelSelect,
    });
    return publicationNotificationChannel(row ?? { id, title: fallback });
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

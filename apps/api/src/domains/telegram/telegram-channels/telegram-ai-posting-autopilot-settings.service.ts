import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { TelegramAiPostingAutopilotActivity, TelegramAiPostingAutopilotState } from '@telegram-system/shared';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  AUTOPILOT_COVERAGE_DAYS,
  AUTOPILOT_REFILL_DAYS,
  AUTOPILOT_STOCK_DAYS,
  autopilotReadyDraftWhere,
  automaticPostingAiAvailable,
  readAutopilotCadence,
} from './telegram-ai-posting-autopilot-policy';

@Injectable()
export class TelegramAiPostingAutopilotSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async read(userId: string, telegramChannelId: string) {
    const { workspaceId } = await this.authorization.require(
      userId,
      'channels.view',
    );
    return this.readState({ workspaceId, telegramChannelId });
  }

  async update(
    userId: string,
    telegramChannelId: string,
    dto: { enabled: boolean },
  ) {
    const { workspaceId } = await this.authorization.require(
      userId,
      'posts.manage',
    );
    if (dto.enabled)
      await this.authorization.require(userId, 'operations.executeAi');
    const scope = { workspaceId, telegramChannelId };
    await this.requireChannel(scope);
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: scope,
      select: {
        configuration: true,
        configurationVersion: true,
        autopilotEnabled: true,
        draftExpirationDays: true,
      },
    });
    if (dto.enabled && !settings?.autopilotEnabled) {
      const config = settings?.configuration as
        | Record<string, unknown>
        | undefined;
      if (
        !settings ||
        typeof config?.topic !== 'string' ||
        !config.topic.trim() ||
        typeof config.audience !== 'string' ||
        !config.audience.trim()
      )
        throw new ConflictException('AI_POSTING_AUTOPILOT_PROFILE_REQUIRED');
      const cadence = await readAutopilotCadence(this.prisma, scope);
      if (!cadence.weeklySlotsMax)
        throw new ConflictException('AI_POSTING_AUTOPILOT_PLAN_REQUIRED');
      const enabled = await this.prisma.telegramAiPostingSettings.updateMany({
        where: {
          ...scope,
          autopilotEnabled: false,
          configurationVersion: settings.configurationVersion,
        },
        data: {
          autopilotEnabled: true,
          mode: 'AUTOPILOT',
          autopilotNextRunAt: new Date(),
          targetCoverageDays: AUTOPILOT_COVERAGE_DAYS,
          criticalCoverageDays: AUTOPILOT_REFILL_DAYS,
          draftExpirationDays: Math.max(
            settings?.draftExpirationDays ?? 30,
            AUTOPILOT_STOCK_DAYS + AUTOPILOT_REFILL_DAYS,
          ),
        },
      });
      if (!enabled.count)
        throw new ConflictException('AI_POSTING_SETTINGS_CHANGED');
    } else if (!dto.enabled && settings?.autopilotEnabled) {
      await this.prisma.telegramAiPostingSettings.updateMany({
        where: { ...scope, autopilotEnabled: true },
        data: { autopilotEnabled: false, autopilotNextRunAt: null },
      });
    }
    notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
    return this.readState(scope);
  }

  private async requireChannel(scope: {
    workspaceId: string;
    telegramChannelId: string;
  }) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: {
        id: scope.telegramChannelId,
        workspaceId: scope.workspaceId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
  }

  private async readState(scope: {
    workspaceId: string;
    telegramChannelId: string;
  }): Promise<TelegramAiPostingAutopilotState> {
    await this.requireChannel(scope);
    const [settings, cadence, runs] = await Promise.all([
      this.prisma.telegramAiPostingSettings.findFirst({
        where: scope,
        select: {
          autopilotEnabled: true,
          autopilotNextRunAt: true,
          autopilotLeaseExpiresAt: true,
          autopilotLastStatus: true,
          autopilotLastError: true,
          autopilotLastSummary: true,
          draftExpirationDays: true,
        },
      }),
      readAutopilotCadence(this.prisma, scope),
      this.prisma.telegramAiPostingAutopilotRun.findMany({
        where: scope,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: {
          id: true, status: true, currentStage: true, startedAt: true,
          completedAt: true, failureType: true, summary: true,
          stages: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 8,
            select: { id: true, stage: true, startedAt: true, metadata: true },
          },
        },
      }),
    ]);
    const now = new Date();
    const [
      drafts,
      readyDrafts,
      lastScheduled,
      automaticGenerationAvailable,
    ] = await Promise.all([
      this.prisma.telegramManagedPost.count({
        where: { ...scope, status: 'DRAFT' },
      }),
      this.prisma.telegramManagedPost.count({
        where: autopilotReadyDraftWhere(
          scope,
          new Date(+now - (settings?.draftExpirationDays ?? 30) * 86_400_000),
        ),
      }),
      this.prisma.telegramManagedPost.findFirst({
        where: {
          ...scope,
          status: 'SCHEDULED',
          scheduledAt: { gt: now },
          adSalePlacements: { none: {} },
          mutualPromotionDelivery: { is: null },
          postBatchDelivery: { is: null },
        },
        select: { scheduledAt: true },
        orderBy: { scheduledAt: 'desc' },
      }),
      automaticPostingAiAvailable(this.prisma, scope.workspaceId),
    ]);
    const active = settings?.autopilotEnabled &&
      settings.autopilotLeaseExpiresAt &&
      settings.autopilotLeaseExpiresAt > now &&
      runs[0]?.status === 'RUNNING' ? runs[0] : null;
    const history: TelegramAiPostingAutopilotActivity[] = runs.map((run) => {
      const summary = jsonRecord(run.summary);
      const errors: unknown[] = Array.isArray(summary.errors) ? summary.errors : [];
      return {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        completedAt: run.completedAt?.toISOString() ?? null,
        errorCodes: [...new Set([...errors, run.failureType].filter(
          (value): value is string => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value),
        ))],
        summary: typeof summary.generated === 'number' && typeof summary.scheduled === 'number'
          ? {
              generated: summary.generated,
              scheduled: summary.scheduled,
              costs: Object.fromEntries(Object.entries(jsonRecord(summary.costs)).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === 'string' && /^\d+(?:\.\d+)?$/.test(entry[1]),
              )),
              unknownCosts: typeof summary.unknownCosts === 'number' ? summary.unknownCosts : 0,
            }
          : null,
        stages: run.stages.reverse().map((stage) => {
          const metadata = jsonRecord(stage.metadata);
          const count = stage.stage === 'SCHEDULE_DRAFTS' ? metadata.vacantSlots : metadata.requested;
          return {
            id: stage.id,
            stage: stage.stage,
            startedAt: stage.startedAt.toISOString(),
            targetCount: typeof count === 'number' ? count : null,
          };
        }),
      };
    });
    return {
      enabled: settings?.autopilotEnabled ?? false,
      automaticGenerationAvailable,
      drafts,
      draftsToGenerate: Math.max(0, cadence.targetReadyDrafts - readyDrafts),
      nextRunAt: settings?.autopilotNextRunAt?.toISOString() ?? null,
      lastStatus: settings?.autopilotLastStatus ?? null,
      lastError: settings?.autopilotLastError ?? null,
      activeStage: active?.currentStage ?? null,
      activeRunId: active?.id ?? null,
      history,
      weeklySlotsMin: cadence.weeklySlotsMin,
      weeklySlotsMax: cadence.weeklySlotsMax,
      targetReadyDrafts: cadence.targetReadyDrafts,
      readyDrafts,
      scheduledThrough: lastScheduled?.scheduledAt?.toISOString() ?? null,
      lastRun: (settings?.autopilotLastSummary ??
        null) as TelegramAiPostingAutopilotState['lastRun'],
    };
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

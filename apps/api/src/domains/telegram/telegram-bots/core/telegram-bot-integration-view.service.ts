import { Injectable } from '@nestjs/common';
import { TelegramBotApplicationType } from '@prisma/client';
import type { TelegramBotIntegrationView } from '@telegram-system/shared';
import { BotBillingAnalyticsService } from '../../bot-billing/bot-billing-analytics.service';
import { TelegramBotApplicationRegistryService } from './telegram-bot-application-registry.service';
import { TelegramBotRuntimeEnvironmentService } from './telegram-bot-runtime-environment.service';
import { publicApiOrigin } from '../../../../config/deployment-config';

@Injectable()
export class TelegramBotIntegrationViewService {
  constructor(
    private readonly applicationRegistry: TelegramBotApplicationRegistryService,
    private readonly billingAnalytics: BotBillingAnalyticsService,
    private readonly runtimeEnvironment: TelegramBotRuntimeEnvironmentService,
  ) {}

  async toView(
    row: Record<string, unknown>,
    accessSummary?: TelegramBotIntegrationView['channelAccessSummary'],
    applications?: TelegramBotIntegrationView['applications'],
    applicationSummary?: TelegramBotIntegrationView['applicationSummary'],
  ): Promise<TelegramBotIntegrationView> {
    const resolvedApplications =
      applications ||
      (await this.applicationRegistry.optionsForWorkspace(String(row.workspaceId)));
    const resolvedApplicationSummary =
      applicationSummary === undefined
        ? await this.applicationSummaryForRow(row)
        : applicationSummary;
    return {
      id: String(row.id),
      workspaceId: String(row.workspaceId),
      label: String(row.label),
      isActive: Boolean(row.isActive),
      applicationType:
        (row.applicationType as TelegramBotApplicationType | undefined) ||
        TelegramBotApplicationType.NONE,
      assignedMember:
        row.assignedMember && typeof row.assignedMember === 'object'
          ? (row.assignedMember as TelegramBotIntegrationView['assignedMember'])
          : null,
      channelAccessSummary: accessSummary || {
        totalChannels: 0,
        canPost: 0,
        canManageInviteLinks: 0,
        canViewStats: 0,
        lastCheckedAt: null,
      },
      applicationSummary: resolvedApplicationSummary,
      runtimes: this.runtimeViews(row.runtimeInstances),
      applications: resolvedApplications,
    };
  }

  async financeSummaryForRuntimes(workspaceId: string, runtimeIds: string[]) {
    return this.billingAnalytics.summariesForRuntimes(workspaceId, runtimeIds);
  }

  financeApplicationSummary(
    summaries: Awaited<ReturnType<BotBillingAnalyticsService['summariesForRuntimes']>>,
    runtimes: Array<{ id: string; environment: 'LOCAL' | 'PRODUCTION' }>,
  ): TelegramBotIntegrationView['applicationSummary'] {
    return {
      applicationType: 'FINANCE',
      finance: Object.fromEntries(runtimes.map((runtime) => {
        const summary = summaries.get(runtime.id);
        return [runtime.environment, {
          registeredUsers: summary?.registeredUsers || 0,
          paidUsers: summary?.paidUsers || 0,
          activeSubscriptions: summary?.activeSubscriptions || 0,
          failedPayments: summary?.failedPayments || 0,
        }];
      })),
    };
  }

  private async applicationSummaryForRow(row: Record<string, unknown>) {
    if (row.applicationType !== TelegramBotApplicationType.FINANCE) return null;
    const runtimes = Array.isArray(row.runtimeInstances)
      ? row.runtimeInstances as Array<{ id: string; environment: 'LOCAL' | 'PRODUCTION' }>
      : [];
    return this.financeApplicationSummary(
      await this.financeSummaryForRuntimes(String(row.workspaceId), runtimes.map((runtime) => runtime.id)),
      runtimes,
    );
  }

  private iso(value: unknown) {
    return value instanceof Date ? value.toISOString() : null;
  }

  private runtimeViews(value: unknown): TelegramBotIntegrationView['runtimes'] {
    if (!Array.isArray(value)) return [];
    return value.map((runtime: Record<string, unknown>) => ({
      id: String(runtime.id),
      environment: runtime.environment as 'LOCAL' | 'PRODUCTION',
      isProcessOwner: this.runtimeEnvironment.owns(runtime.environment as never),
      botTokenMasked: String(runtime.botTokenMasked),
      tokenState: 'SAVED' as const,
      botId: (runtime.botId as string | null) || null,
      username: (runtime.username as string | null) || null,
      firstName: (runtime.firstName as string | null) || null,
      avatarUrl: this.avatarUrl(runtime),
      avatarUpdatedAt: this.iso(runtime.avatarUpdatedAt),
      lastErrorMessage: (runtime.lastErrorMessage as string | null) || null,
      lastCheckedAt: this.iso(runtime.lastCheckedAt),
      runtimeStatus: runtime.runtimeStatus as never,
      webhookStatus: runtime.webhookStatus as never,
      webhookUrl: (runtime.webhookUrl as string | null) || null,
      webhookConnectionStatus: this.webhookConnectionStatus(
        runtime.webhookStatus,
        runtime.webhookUrl,
      ),
      webhookConfiguredAt: this.iso(runtime.webhookConfiguredAt),
      lastUpdateProcessedAt: this.iso(runtime.lastUpdateProcessedAt),
      lastRuntimeError: (runtime.lastRuntimeError as string | null) || null,
      webApp: {
        status: this.webAppStatus(runtime.webAppStatus),
        url: (runtime.webAppUrl as string | null) || null,
        error: (runtime.webAppError as string | null) || null,
      },
      miniApp: {
        status: this.miniAppStatus(runtime.miniAppStatus),
        expectedUrl: (runtime.miniAppExpectedUrl as string | null) || null,
        actualUrl: (runtime.miniAppActualUrl as string | null) || null,
        error: (runtime.miniAppError as string | null) || null,
      },
    }));
  }

  private webAppStatus(value: unknown) {
    return value === 'AVAILABLE' || value === 'ERROR' || value === 'NOT_CONFIGURED'
      ? value
      : ('UNKNOWN' as const);
  }

  private avatarUrl(runtime: Record<string, unknown>) {
    const updatedAt = this.iso(runtime.avatarUpdatedAt);
    if (!updatedAt) return null;
    const path = `/api/telegram-bot-runtime-avatars/${encodeURIComponent(String(runtime.id))}?v=${encodeURIComponent(updatedAt)}`;
    return publicApiOrigin() ? `${publicApiOrigin()}${path}` : path;
  }

  private miniAppStatus(value: unknown) {
    return value === 'CONFIGURED' || value === 'ERROR' || value === 'NOT_CONFIGURED'
      ? value
      : ('UNKNOWN' as const);
  }

  private webhookConnectionStatus(status: unknown, url: unknown) {
    if (status === 'CONFIGURED') return 'CONNECTED' as const;
    if (status === 'ERROR') return 'NOT_CONNECTED' as const;
    return typeof url === 'string' && url
      ? ('NOT_CONNECTED' as const)
      : ('UNKNOWN' as const);
  }
}

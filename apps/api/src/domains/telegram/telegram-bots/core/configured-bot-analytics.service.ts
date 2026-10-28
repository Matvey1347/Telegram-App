import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceRole } from '@prisma/client';
import sharp from 'sharp';
import { WorkspaceService } from '../../../../common/workspace.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/bot/telegram-bot-api.client';

type Environment = 'LOCAL' | 'PRODUCTION';

type FinanceOverview = {
  status: 'AVAILABLE' | 'MIGRATION_REQUIRED';
  bots: Array<{
    id: string;
    managementBotId?: string | null;
    environment: Environment;
    username: string | null;
    name: string | null;
    description?: string | null;
    avatarUpdatedAt?: string | null;
    registeredUsers: number;
    profiles: number;
  }>;
};

/**
 * Dashboard read model for bots configured by deployment environment rather
 * than workspace TelegramBotIntegration records. It deliberately makes one
 * on-demand request to Finance only when an authorized user opens the page.
 */
@Injectable()
export class ConfiguredBotAnalyticsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly botApi: TelegramBotApiClient,
  ) {}

  async overview(userId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const [systemBot, financeBot] = await Promise.all([
      this.systemBotOverview(workspaceId),
      this.financeBotOverview(workspaceId),
    ]);
    return { systemBot, financeBot };
  }

  async systemBotAvatar(userId: string, environment: Environment) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    this.assertSystemBotWorkspace(workspaceId);
    const runtime = this.systemBotRuntime(environment);
    if (!runtime) {
      throw new BadRequestException('System bot runtime is not configured');
    }
    const cached = await this.cachedSystemBotAvatar(workspaceId, environment);
    if (cached?.username === runtime.username) {
      return cached.image
        ? { bytes: Buffer.from(cached.image), contentType: cached.mimeType || 'image/jpeg' }
        : null;
    }

    return this.refreshSystemBotAvatarForWorkspace(workspaceId, runtime);
  }

  async refreshSystemBotAvatars(userId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    this.assertSystemBotWorkspace(workspaceId);
    const runtimes = (['LOCAL', 'PRODUCTION'] as const)
      .map((environment) => this.systemBotRuntime(environment))
      .filter((runtime): runtime is NonNullable<typeof runtime> => Boolean(runtime));
    await Promise.all(
      runtimes.map((runtime) =>
        this.refreshSystemBotAvatarForWorkspace(workspaceId, runtime),
      ),
    );
    return { refreshedEnvironments: runtimes.map((runtime) => runtime.environment) };
  }

  async updateSystemBotProfile(
    userId: string,
    environment: Environment,
    input: {
      name?: string;
      description?: string;
    },
  ) {
    const membership = await this.workspace.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
    const workspaceId = membership.workspaceId;
    this.assertSystemBotWorkspace(workspaceId);
    const runtime = this.systemBotRuntime(environment);
    if (!runtime) {
      throw new BadRequestException('System bot runtime is not configured');
    }
    const name = input.name?.trim();
    const hasDescription = input.description !== undefined;
    const description = input.description?.trim();
    if (input.name !== undefined && !name) {
      throw new BadRequestException('Bot name cannot be empty');
    }
    if (!name && !hasDescription) throw new BadRequestException('A name or description is required');
    if (name) await this.botApi.setMyName(runtime.token, name);
    if (hasDescription) await this.botApi.setMyDescription(runtime.token, description || '');

    await this.saveSystemBotProfile(workspaceId, runtime, {
      name,
      ...(hasDescription ? { description: description || '' } : {}),
    });
    return this.overview(userId);
  }

  private async refreshSystemBotAvatarForWorkspace(
    workspaceId: string,
    runtime: NonNullable<ReturnType<ConfiguredBotAnalyticsService['systemBotRuntime']>>,
  ) {
    const bot = await this.botApi.getMe(runtime.token);
    const photos = await this.botApi.getUserProfilePhotos(
      runtime.token,
      String(bot.id),
    );
    const photo = photos.photos?.[0]?.at(-1);
    let avatar: { bytes: Buffer; contentType: string } | null = null;
    if (photo?.file_id) {
      const file = await this.botApi.getFile(runtime.token, photo.file_id);
      if (file.file_path) {
        avatar = await this.botApi.downloadFile(
          runtime.token,
          file.file_path,
          5 * 1024 * 1024,
        );
      }
    }
    avatar ??= await this.botApi.downloadUsernameProfilePhoto(runtime.username);

    const cached = await this.cachedSystemBotAvatar(
      workspaceId,
      runtime.environment,
    );
    const unchanged =
      cached?.username === runtime.username &&
      cached.mimeType === (avatar?.contentType ?? null) &&
      Buffer.from(cached?.image ?? []).equals(avatar?.bytes ?? Buffer.alloc(0));
    if (!unchanged) {
      await this.saveSystemBotAvatar(workspaceId, runtime, avatar);
    }
    return avatar;
  }

  async financeUsers(
    userId: string,
    environment: Environment,
    cursor?: string,
  ) {
    if (environment !== 'LOCAL' && environment !== 'PRODUCTION') {
      throw new BadRequestException('Unknown Finance bot environment');
    }
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    if (
      this.configuredWorkspaceId('FINANCE_BOT_DASHBOARD_WORKSPACE_ID') !==
      workspaceId
    ) {
      throw new BadRequestException(
        'Finance bot analytics is not available in this workspace',
      );
    }
    const settings = this.financeAnalyticsSettings();
    if (!settings)
      throw new ServiceUnavailableException(
        'Finance bot analytics is not configured',
      );
    try {
      const url = new URL('/api/admin/analytics/users', settings.url);
      url.searchParams.set('environment', environment);
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await fetch(url, {
        headers: this.financeAnalyticsHeaders(settings.token, workspaceId),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok)
        throw new ServiceUnavailableException(
          'Finance bot analytics is unavailable',
        );
      return response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Finance bot analytics is unavailable',
      );
    }
  }

  async financeBotAvatar(userId: string, environment: Environment) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    if (
      this.configuredWorkspaceId('FINANCE_BOT_DASHBOARD_WORKSPACE_ID') !==
      workspaceId
    ) {
      throw new BadRequestException(
        'Finance bot analytics is not available in this workspace',
      );
    }
    const settings = this.financeAnalyticsSettings();
    if (!settings) return null;
    const url = new URL('/api/admin/analytics/avatar', settings.url);
    url.searchParams.set('environment', environment);
    const response = await fetch(url, {
      headers: this.financeAnalyticsHeaders(settings.token, workspaceId),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 204) return null;
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Finance bot profile is unavailable',
      );
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'image/jpeg',
    };
  }

  async refreshFinanceBotAvatars(userId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    if (this.configuredWorkspaceId('FINANCE_BOT_DASHBOARD_WORKSPACE_ID') !== workspaceId) {
      throw new BadRequestException('Finance bot analytics is not available in this workspace');
    }
    const settings = this.financeAnalyticsSettings();
    if (!settings) throw new ServiceUnavailableException('Finance bot analytics is not configured');
    try {
      const response = await fetch(new URL('/api/admin/analytics/avatars/refresh', settings.url), {
        method: 'POST',
        headers: this.financeAnalyticsHeaders(settings.token, workspaceId),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new ServiceUnavailableException('Finance bot profile refresh is unavailable');
      return response.json();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Finance bot profile refresh is unavailable');
    }
  }

  async updateFinanceBotProfile(
    userId: string,
    environment: Environment,
    input: { name?: string; description?: string },
  ) {
    const workspaceId = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner, WorkspaceRole.admin]).then((membership) => membership.workspaceId);
    if (this.configuredWorkspaceId('FINANCE_BOT_DASHBOARD_WORKSPACE_ID') !== workspaceId) {
      throw new BadRequestException('Finance bot analytics is not available in this workspace');
    }
    const settings = this.financeAnalyticsSettings();
    if (!settings) throw new ServiceUnavailableException('Finance bot analytics is not configured');
    const form = new FormData();
    if (input.name !== undefined) form.set('name', input.name);
    if (input.description !== undefined) form.set('description', input.description);
    form.set('confirmTelegramUpdate', 'true');
    try {
      const response = await fetch(new URL(`/api/admin/analytics/bots/${environment}/profile`, settings.url), {
        method: 'PATCH',
        headers: this.financeAnalyticsHeaders(settings.token, workspaceId),
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new ServiceUnavailableException('Finance bot update is unavailable');
      return this.overview(userId);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException('Finance bot update is unavailable');
    }
  }

  private async systemBotOverview(workspaceId: string) {
    if (
      this.configuredWorkspaceId(
        'TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID',
      ) !== workspaceId
    ) {
      return null;
    }
    const [registeredUsers, enabledUsers, activeUsers] = await Promise.all([
      this.prisma.telegramSystemBotConnection.count(),
      this.prisma.telegramSystemBotConnection.count({
        where: { enabled: true },
      }),
      this.prisma.telegramSystemBotConnection.count({
        where: { lastInteractionAt: { gte: daysAgo(30) } },
      }),
    ]);
    return {
      runtimes: await this.systemBotDashboardRuntimes(workspaceId),
      analytics: { registeredUsers, enabledUsers, activeUsers },
    };
  }

  private async financeBotOverview(workspaceId: string) {
    if (
      this.configuredWorkspaceId('FINANCE_BOT_DASHBOARD_WORKSPACE_ID') !==
      workspaceId
    ) {
      return null;
    }
    const settings = this.financeAnalyticsSettings();
    if (!settings) {
      return { status: 'NOT_CONFIGURED' as const, bots: [] };
    }
    try {
      const response = await fetch(
        new URL('/api/admin/analytics', settings.url),
        {
          headers: this.financeAnalyticsHeaders(settings.token, workspaceId),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) return { status: 'UNAVAILABLE' as const, bots: [] };
      const body = (await response.json()) as FinanceOverview;
      if (body.status === 'MIGRATION_REQUIRED') {
        return { status: 'MIGRATION_REQUIRED' as const, bots: [] };
      }
      const legacyMetrics = await this.legacyFinanceMetrics(workspaceId);
      return {
        status: 'AVAILABLE' as const,
        bots: body.bots.map((bot) => {
          const legacy = legacyMetrics.get(
            `${bot.environment}:${bot.username?.trim().replace(/^@/, '').toLowerCase() ?? ''}`,
          );
          const financeIcon = bot.environment === 'LOCAL' ? '/brand/groshly-dev-icon.png' : '/brand/groshly-icon.png';
          return {
          ...bot,
          // Consumer Finance is being moved to its own host. Until a runtime
          // has been migrated, its users still belong to the retained platform
          // record; use that real read-model instead of displaying a false 0.
          registeredUsers: Math.max(bot.registeredUsers, legacy?.registeredUsers ?? 0),
          profiles: Math.max(bot.profiles, legacy?.profiles ?? 0),
          managementBotId: legacy?.botId ?? null,
          faviconUrl: financeIcon,
          faviconLightUrl: bot.environment === 'LOCAL' ? '/brand/groshly-dev-dark-icon.png' : '/brand/groshly-dark-icon.png',
          avatarUrl: financeIcon,
          };
        }),
      };
    } catch {
      // The dashboard remains usable while a separately deployed product is down.
      return { status: 'UNAVAILABLE' as const, bots: [] };
    }
  }

  private async legacyFinanceMetrics(workspaceId: string) {
    const bots = await this.prisma.telegramBotIntegration.findMany({
      where: { workspaceId, applicationType: 'FINANCE' },
      select: {
        id: true,
        _count: { select: { botUsers: true, financeProfiles: true } },
        runtimeInstances: {
          select: {
            environment: true,
            username: true,
          },
        },
      },
    });
    const metrics = new Map<
      string,
      {
        botId: string;
        registeredUsers: number;
        profiles: number;
      }
    >();
    for (const bot of bots) {
      for (const runtime of bot.runtimeInstances) {
        const username = runtime.username?.trim().replace(/^@/, '').toLowerCase();
        if (!username) continue;
        metrics.set(`${runtime.environment}:${username}`, {
          botId: bot.id,
          registeredUsers: bot._count.botUsers,
          profiles: bot._count.financeProfiles,
        });
      }
    }
    return metrics;
  }

  private configuredWorkspaceId(name: string) {
    return this.config.get<string>(name)?.trim() || null;
  }

  private financeAnalyticsSettings() {
    const url = this.config.get<string>('FINANCE_ADMIN_ANALYTICS_URL')?.trim();
    const token = this.config
      .get<string>('FINANCE_ADMIN_ANALYTICS_TOKEN')
      ?.trim();
    return url && token ? { url, token } : null;
  }

  private financeAnalyticsHeaders(token: string, workspaceId: string) {
    return {
      'x-finance-admin-analytics-token': token,
      'x-nexeloq-workspace-id': workspaceId,
    };
  }

  private async systemBotDashboardRuntimes(workspaceId: string) {
    const selected = this.config
      .get<string>('TELEGRAM_SYSTEM_BOT_ENVIRONMENT')
      ?.trim();
    const runtimes = (['LOCAL', 'PRODUCTION'] as const)
      .map((environment) => this.systemBotRuntime(environment))
      .filter((runtime): runtime is NonNullable<typeof runtime> =>
        Boolean(runtime),
      );
    const cachedAvatars = await this.cachedSystemBotAvatars(workspaceId);
    return runtimes.map((runtime) => {
      const cachedAvatar = cachedAvatars.find(
        (avatar) =>
          avatar.environment === runtime.environment &&
          avatar.username === runtime.username,
      );
      return {
          environment: runtime.environment,
          username: runtime.username,
          // Profile data is refreshed only by the explicit Refresh action.
          // Ordinary dashboard navigation must not call Telegram.
          name: cachedAvatar?.displayName || runtime.username,
          description: cachedAvatar?.description || null,
          avatarUrl: runtime.environment === 'LOCAL'
            ? '/brand/telegram-system-dev.png'
            : '/brand/telegram-system.png',
          configured: true,
          selected: selected === runtime.environment,
      };
    });
  }

  private systemBotRuntime(environment: Environment) {
    const username = this.config
      .get<string>(`TELEGRAM_SYSTEM_BOT_${environment}_USERNAME`)
      ?.trim();
    const token = this.config
      .get<string>(`TELEGRAM_SYSTEM_BOT_${environment}_TOKEN`)
      ?.trim();
    return username && token ? { environment, username, token } : null;
  }

  private assertSystemBotWorkspace(workspaceId: string) {
    if (
      this.configuredWorkspaceId(
        'TELEGRAM_SYSTEM_BOT_DASHBOARD_WORKSPACE_ID',
      ) !== workspaceId
    ) {
      throw new BadRequestException(
        'System bot analytics is not available in this workspace',
      );
    }
  }

  private async cachedSystemBotAvatar(
    workspaceId: string,
    environment: Environment,
  ) {
    try {
      return await this.prisma.telegramConfiguredBotAvatar.findUnique({
        where: {
          workspaceId_kind_environment: {
            workspaceId,
            kind: 'SYSTEM',
            environment,
          },
        },
        select: { username: true, image: true, mimeType: true },
      });
    } catch (error) {
      if (isMissingConfiguredBotAvatarTable(error)) return null;
      throw error;
    }
  }

  private async cachedSystemBotAvatars(workspaceId: string) {
    try {
      return await this.prisma.telegramConfiguredBotAvatar.findMany({
        where: { workspaceId, kind: 'SYSTEM' },
        select: {
          environment: true,
          username: true,
          displayName: true,
          description: true,
        },
      });
    } catch (error) {
      if (isMissingConfiguredBotAvatarTable(error)) return [];
      throw error;
    }
  }

  private async saveSystemBotAvatar(
    workspaceId: string,
    runtime: NonNullable<ReturnType<ConfiguredBotAnalyticsService['systemBotRuntime']>>,
    avatar: { bytes: Buffer; contentType: string } | null,
  ) {
    try {
      await this.prisma.telegramConfiguredBotAvatar.upsert({
        where: {
          workspaceId_kind_environment: {
            workspaceId,
            kind: 'SYSTEM',
            environment: runtime.environment,
          },
        },
        create: {
          workspaceId,
          kind: 'SYSTEM',
          environment: runtime.environment,
          username: runtime.username,
          image: avatar ? Uint8Array.from(avatar.bytes) : null,
          mimeType: avatar?.contentType,
        },
        update: {
          username: runtime.username,
          image: avatar ? Uint8Array.from(avatar.bytes) : null,
          mimeType: avatar?.contentType,
        },
      });
    } catch (error) {
      // Deploy code before the migration without taking the Bots screen down.
      if (!isMissingConfiguredBotAvatarTable(error)) throw error;
    }
  }

  private async saveSystemBotProfile(
    workspaceId: string,
    runtime: NonNullable<ReturnType<ConfiguredBotAnalyticsService['systemBotRuntime']>>,
    profile: {
      name?: string;
      description?: string;
    },
  ) {
    try {
      await this.prisma.telegramConfiguredBotAvatar.upsert({
        where: {
          workspaceId_kind_environment: {
            workspaceId,
            kind: 'SYSTEM',
            environment: runtime.environment,
          },
        },
        create: {
          workspaceId,
          kind: 'SYSTEM',
          environment: runtime.environment,
          username: runtime.username,
          displayName: profile.name,
          description: profile.description,
        },
        update: {
          ...(profile.name ? { displayName: profile.name } : {}),
          ...(profile.description !== undefined ? { description: profile.description } : {}),
        },
      });
    } catch (error) {
      if (!isMissingConfiguredBotAvatarTable(error)) throw error;
    }
  }
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function isMissingConfiguredBotAvatarTable(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2021'
  );
}

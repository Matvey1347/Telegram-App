import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramSourceType,
  WorkspaceRole,
} from '@prisma/client';
import type { TelegramBotIntegrationView } from '@telegram-system/shared';
import { ApplicationLoggerService } from '../../../operations/application-logs/application-logger.service';
import { WorkspaceService } from '../../../../common/workspace.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramSourceAccessService } from '../../../../telegram/shared/telegram-source-access.service';
import {
  CreateTelegramBotDto,
  SwitchTelegramBotApplicationDto,
  UpdateTelegramBotDto,
  UpsertTelegramBotRuntimeDto,
} from './dto';
import { TelegramBotApplicationRegistryService } from './telegram-bot-application-registry.service';
import { TelegramBotRuntimeService } from './telegram-bot-runtime.service';
import { TelegramBotIdentityService } from './telegram-bot-identity.service';
import { TelegramBotIntegrationViewService } from './telegram-bot-integration-view.service';

@Injectable()
export class TelegramBotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly botApi: TelegramBotApiClient,
    private readonly applicationRegistry: TelegramBotApplicationRegistryService,
    private readonly runtime: TelegramBotRuntimeService,
    private readonly applicationLogger: ApplicationLoggerService,
    private readonly identity: TelegramBotIdentityService,
    private readonly viewService: TelegramBotIntegrationViewService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private async adminWorkspace(userId: string) {
    return this.workspaceService.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
  }

  private environment(value?: string) {
    const configured = value || process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT;
    if (configured === TelegramBotRuntimeEnvironment.LOCAL) {
      return TelegramBotRuntimeEnvironment.LOCAL;
    }
    if (
      configured === TelegramBotRuntimeEnvironment.PRODUCTION ||
      (!configured && process.env.NODE_ENV === 'production')
    ) {
      return TelegramBotRuntimeEnvironment.PRODUCTION;
    }
    throw new BadRequestException(
      'Workspace Telegram bot runtime environment is not enabled',
    );
  }

  private maskToken(token: string) {
    const [id] = token.split(':');
    return id ? `${id}:***` : '***';
  }

  private channelChatRef(channel: {
    username: string | null;
    telegramChatId: string | null;
  }) {
    if (channel.username)
      return `@${String(channel.username).replace(/^@/, '')}`;
    if (!channel.telegramChatId) return null;
    const normalized = String(channel.telegramChatId)
      .replace(/^-100/, '')
      .replace(/^-/, '');
    return normalized ? `-100${normalized}` : null;
  }

  private async syncKnownChannelAccess(
    workspaceId: string,
    botId: string,
    token: string,
    telegramBotId: string,
  ) {
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, username: true, telegramChatId: true },
    });
    let checked = 0;
    for (const channel of channels) {
      const chatRef = this.channelChatRef(channel);
      if (!chatRef) continue;
      let member: Record<string, unknown>;
      try {
        member = await this.botApi.getChatMember(token, chatRef, telegramBotId);
      } catch (error) {
        if (
          error instanceof TelegramBotApiError &&
          (error.kind === 'PERMANENT' || error.kind === 'BLOCKED')
        ) {
          this.applicationLogger.writeStructured({
            level: 'warn',
            kind: 'application',
            source: TelegramBotsService.name,
            event: 'telegram_bot.channel_access_check_skipped',
            message: 'Unable to check bot access for a Telegram channel.',
            workspaceId,
            metadata: {
              botIntegrationId: botId,
              channelId: channel.id,
              reason: error.message,
            },
          });
          continue;
        }
        throw error;
      }
      if (!member) continue;
      const normalized =
        this.sourceAccessService.normalizeBotPermissions(member);
      await this.sourceAccessService.upsertAccess({
        workspaceId,
        channelId: channel.id,
        sourceId: botId,
        sourceType: TelegramSourceType.BOT,
        role: normalized.role,
        permissions: normalized.permissions,
        rawPermissions: member,
      });
      checked += 1;
    }
    return checked;
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    const rows = await this.prisma.telegramBotIntegration.findMany({
      where: { workspaceId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
        runtimeInstances: { orderBy: { environment: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const uniqueRows = this.identity.deduplicate(rows);
    const summaries = await this.channelAccessSummaries(
      workspaceId,
      uniqueRows.map((row) => row.id),
    );
    const applications = await this.applicationRegistry.optionsForWorkspace(workspaceId);
    const financeBotIds = uniqueRows
      .filter((row) => row.applicationType === TelegramBotApplicationType.FINANCE)
      .map((row) => row.id);
    const financeSummaries = await this.viewService.financeSummaryForBots(
      workspaceId,
      financeBotIds,
    );
    return Promise.all(
      uniqueRows.map((row) =>
        this.viewService.toView(
          row,
          summaries.get(row.id),
          applications,
          row.applicationType === TelegramBotApplicationType.FINANCE
            ? this.viewService.financeApplicationSummary(financeSummaries, row.id)
            : null,
        ),
      ),
    );
  }

  async findOne(userId: string, id: string) {
    const row = await this.findOneRaw(userId, id);
    return this.viewService.toView(
      row,
      (await this.channelAccessSummaries(row.workspaceId, [row.id])).get(
        row.id,
      ),
    );
  }

  private async findOneRaw(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.telegramBotIntegration.findFirst({
      where: { id, workspaceId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
        runtimeInstances: { orderBy: { environment: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Telegram bot not found');
    return row;
  }

  private async channelAccessSummaries(workspaceId: string, botIds: string[]) {
    const map = new Map<
      string,
      TelegramBotIntegrationView['channelAccessSummary']
    >();
    for (const botId of botIds) {
      map.set(botId, {
        totalChannels: 0,
        canPost: 0,
        canManageInviteLinks: 0,
        canViewStats: 0,
        lastCheckedAt: null,
      });
    }
    if (botIds.length === 0) return map;
    const rows = await this.prisma.telegramChannelSourceAccess.findMany({
      where: {
        workspaceId,
        sourceType: TelegramSourceType.BOT,
        sourceId: { in: botIds },
      },
      select: {
        sourceId: true,
        canPostMessages: true,
        canManageInviteLinks: true,
        canViewStats: true,
        lastCheckedAt: true,
      },
    });
    for (const row of rows) {
      const summary = map.get(row.sourceId);
      if (!summary) continue;
      summary.totalChannels += 1;
      if (row.canPostMessages) summary.canPost += 1;
      if (row.canManageInviteLinks) summary.canManageInviteLinks += 1;
      if (row.canViewStats) summary.canViewStats += 1;
      if (
        row.lastCheckedAt &&
        (!summary.lastCheckedAt ||
          row.lastCheckedAt.toISOString() > summary.lastCheckedAt)
      ) {
        summary.lastCheckedAt = row.lastCheckedAt.toISOString();
      }
    }
    return map;
  }

  async channels(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id, workspaceId },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    return this.sourceAccessService.channelsForSource(
      workspaceId,
      id,
      TelegramSourceType.BOT,
    );
  }

  async create(userId: string, dto: CreateTelegramBotDto) {
    await this.adminWorkspace(userId);
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const environment = this.environment(dto.environment);
    const logical = await this.prisma.telegramBotIntegration.create({
      data: {
        workspaceId,
        label: 'Telegram bot',
        assignedMemberId,
        createdByUserId: userId,
      },
    });
    let configured;
    try {
      configured = await this.runtime.configureRuntime({
        botIntegrationId: logical.id,
        environment,
        token: dto.botToken,
      });
    } catch (error) {
      await this.prisma.telegramBotIntegration.delete({ where: { id: logical.id } });
      throw error;
    }
    await this.prisma.telegramBotIntegration.update({
      where: { id: logical.id },
      data: {
        label: configured.firstName || configured.username || 'Telegram bot',
      },
    });
    await this.syncKnownChannelAccess(
      workspaceId,
      logical.id,
      dto.botToken,
      String(configured.botId),
    );
    return this.findOne(userId, logical.id);
  }

  async update(userId: string, id: string, dto: UpdateTelegramBotDto) {
    await this.adminWorkspace(userId);
    const existing = await this.findOneRaw(userId, id);
    const data: Record<string, unknown> = { label: dto.label };
    if (dto.assignedMemberId !== undefined) {
      data.assignedMemberId = (
        await this.workspaceService.resolveAssignedMemberId(
          userId,
          dto.assignedMemberId,
        )
      ).assignedMemberId;
    }
    const row = await this.prisma.telegramBotIntegration.update({
      where: { id: existing.id },
      data,
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
        runtimeInstances: { orderBy: { environment: 'desc' } },
      },
    });
    return this.viewService.toView(
      row,
      (await this.channelAccessSummaries(row.workspaceId, [row.id])).get(
        row.id,
      ),
    );
  }

  async switchApplication(
    userId: string,
    id: string,
    dto: SwitchTelegramBotApplicationDto,
  ) {
    const membership = await this.workspaceService.requireWorkspaceRole(
      userId,
      [WorkspaceRole.owner, WorkspaceRole.admin],
    );
    const existing = await this.prisma.telegramBotIntegration.findFirst({
      where: { id, workspaceId: membership.workspaceId },
    });
    if (!existing) throw new NotFoundException('Telegram bot not found');
    if (existing.applicationType === dto.applicationType) {
      return this.findOne(userId, id);
    }
    const target = dto.applicationType;
    if (
      target !== TelegramBotApplicationType.NONE &&
      !(await this.applicationRegistry.isEligible(existing.workspaceId, target))
    ) {
      throw new BadRequestException(
        'This bot application is not enabled for this workspace',
      );
    }
    let environment: TelegramBotRuntimeEnvironment | null = null;
    try {
      environment = this.environment();
    } catch {
      // Plain development may change shared business configuration without
      // owning either Telegram runtime.
    }
    if (target === TelegramBotApplicationType.NONE && environment) {
      const runtime = await this.prisma.telegramBotRuntimeInstance.findUnique({
        where: {
          botIntegrationId_environment: {
            botIntegrationId: existing.id,
            environment,
          },
        },
      });
      if (runtime?.runtimeStatus !== TelegramBotRuntimeStatus.DISABLED) {
        await this.runtime.disableRuntime(existing.id, environment);
      }
    }
    const row = await this.prisma.telegramBotIntegration.update({
      where: { id: existing.id },
      data: { applicationType: target },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
        runtimeInstances: { orderBy: { environment: 'desc' } },
      },
    });
    if (target !== TelegramBotApplicationType.NONE && environment) {
      const ownedRuntime = row.runtimeInstances.find(
        (item) => item.environment === environment,
      );
      if (ownedRuntime && ownedRuntime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE) {
        try {
          await this.runtime.enableRuntime({
            botIntegrationId: existing.id,
            environment,
          });
        } catch (error) {
          await this.prisma.telegramBotIntegration.update({
            where: { id: existing.id },
            data: { applicationType: existing.applicationType },
          });
          throw error;
        }
      } else if (ownedRuntime) {
        await this.runtime.reconcilePresentation(ownedRuntime.id);
      }
    }
    this.applicationLogger.writeStructured({
      kind: 'audit',
      level: 'info',
      source: TelegramBotsService.name,
      event: 'telegram_bot.application_type_changed',
      message: 'Telegram bot application type changed.',
      workspaceId: existing.workspaceId,
      userId,
      metadata: {
        botIntegrationId: existing.id,
        from: existing.applicationType,
        to: target,
      },
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    await this.adminWorkspace(userId);
    const existing = await this.findOneRaw(userId, id);
    if (
      existing.runtimeInstances.some(
        (runtime) => runtime.runtimeStatus !== TelegramBotRuntimeStatus.DISABLED,
      )
    ) {
      throw new BadRequestException(
        'Disable and remove each runtime before deleting the logical bot',
      );
    }
    await this.prisma.telegramChannelSourceAccess.deleteMany({
      where: {
        workspaceId: existing.workspaceId,
        sourceId: id,
        sourceType: TelegramSourceType.BOT,
      },
    });
    await this.prisma.telegramBotIntegration.deleteMany({
      where: { id, workspaceId: existing.workspaceId },
    });
    return this.viewService.toView(existing);
  }

  async upsertRuntime(
    userId: string,
    id: string,
    environment: string,
    dto: UpsertTelegramBotRuntimeDto,
  ) {
    await this.adminWorkspace(userId);
    await this.findOneRaw(userId, id);
    await this.runtime.configureRuntime({
      botIntegrationId: id,
      environment: this.environment(environment),
      token: dto.botToken,
    });
    return this.findOne(userId, id);
  }

  async checkRuntime(userId: string, id: string, environment: string) {
    await this.adminWorkspace(userId);
    await this.findOneRaw(userId, id);
    await this.runtime.checkRuntime(id, this.environment(environment));
    return this.findOne(userId, id);
  }

  async enableRuntime(userId: string, id: string, environment: string) {
    await this.adminWorkspace(userId);
    await this.findOneRaw(userId, id);
    await this.runtime.enableRuntime({
      botIntegrationId: id,
      environment: this.environment(environment),
    });
    return this.findOne(userId, id);
  }

  async disableRuntime(userId: string, id: string, environment: string) {
    await this.adminWorkspace(userId);
    await this.findOneRaw(userId, id);
    await this.runtime.disableRuntime(id, this.environment(environment));
    return this.findOne(userId, id);
  }

  async removeRuntime(userId: string, id: string, environment: string) {
    await this.adminWorkspace(userId);
    await this.findOneRaw(userId, id);
    await this.runtime.removeRuntime(id, this.environment(environment));
    return this.findOne(userId, id);
  }
}

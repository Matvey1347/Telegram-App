import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GreeterConfig,
  GreeterChannel,
  GreeterAutomationEnvironment,
  TelegramSourceType,
} from '@prisma/client';
import type {
  GreeterButtonRows,
  GreeterChannelOverrideInput,
  GreeterConfigInput,
  GreeterConfigView,
  GreeterOverview,
  GreeterTemplateContextInput,
  GreeterTemplatePreview,
} from '@telegram-system/shared';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramSourceAccessService } from '../../../../telegram/shared/telegram-source-access.service';
import { GreeterAdminService } from './greeter-admin.service';
import { GreeterConfigVersionService } from './greeter-config-version.service';
import { GreeterTemplatePreviewService } from './greeter-template-preview.service';
import { assertValidGreeterTemplate } from './greeter-template.renderer';

const configFields = [
  'captchaEnabled',
  'captchaType',
  'captchaMessage',
  'confirmButtonText',
  'choicePrompt',
  'timeoutMinutes',
  'successMessage',
  'failureMessage',
  'failureBehavior',
] as const;

type ConfigValues = Pick<GreeterConfig, (typeof configFields)[number]>;
type ChannelValues = Pick<
  GreeterChannel,
  'useGlobalConfig' | (typeof configFields)[number]
>;
@Injectable()
export class GreeterConfigurationService {
  private readonly versions: GreeterConfigVersionService;
  private readonly previews: GreeterTemplatePreviewService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: GreeterAdminService,
    private readonly botApi: TelegramBotApiClient,
    private readonly encryption: TokenEncryptionService,
    private readonly sourceAccess: TelegramSourceAccessService,
  ) {
    this.versions = new GreeterConfigVersionService(prisma);
    this.previews = new GreeterTemplatePreviewService(prisma, admin);
  }
  private token(bot: {
    botTokenEncrypted: string;
    botTokenIv: string;
    botTokenAuthTag: string;
  }) {
    return this.encryption.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
  }

  private validateConfig(input: Partial<GreeterConfigInput>) {
    for (const value of [
      input.captchaMessage,
      input.choicePrompt,
      input.successMessage,
      input.failureMessage,
    ]) {
      if (value != null) {
        try {
          assertValidGreeterTemplate(value);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
      }
    }
  }

  private view(
    config: ConfigValues,
    channel?: ChannelValues,
  ): GreeterConfigView {
    const override = channel && !channel.useGlobalConfig;
    return {
      captchaEnabled: override
        ? (channel.captchaEnabled ?? config.captchaEnabled)
        : config.captchaEnabled,
      captchaType: override
        ? (channel.captchaType ?? config.captchaType)
        : config.captchaType,
      captchaMessage: override
        ? (channel.captchaMessage ?? config.captchaMessage)
        : config.captchaMessage,
      confirmButtonText: override
        ? (channel.confirmButtonText ?? config.confirmButtonText)
        : config.confirmButtonText,
      choicePrompt: override
        ? (channel.choicePrompt ?? config.choicePrompt)
        : config.choicePrompt,
      timeoutMinutes: override
        ? (channel.timeoutMinutes ?? config.timeoutMinutes)
        : config.timeoutMinutes,
      successMessage: override
        ? (channel.successMessage ?? config.successMessage)
        : config.successMessage,
      failureMessage: override
        ? (channel.failureMessage ?? config.failureMessage)
        : config.failureMessage,
      failureBehavior: override
        ? (channel.failureBehavior ?? config.failureBehavior)
        : config.failureBehavior,
      source: override ? 'OVERRIDE' : 'GLOBAL',
    };
  }

  async effectiveConfig(
    botIntegrationId: string,
    channel?: GreeterChannel,
    environment: GreeterAutomationEnvironment = GreeterAutomationEnvironment.PRODUCTION,
  ) {
    const config = await this.prisma.greeterConfig.upsert({
      where: { botIntegrationId },
      create: { workspaceId: channel!.workspaceId, botIntegrationId },
      update: {},
    });
    if (
      environment === GreeterAutomationEnvironment.TEST ||
      !config.currentPublishedVersionId
    ) {
      return this.view(config, channel);
    }
    const version = await this.prisma.greeterConfigVersion.findUnique({
      where: { id: config.currentPublishedVersionId },
      include: {
        channelVersions: channel
          ? { where: { greeterChannelId: channel.id }, take: 1 }
          : false,
      },
    });
    if (!version) return this.view(config, channel);
    const channelVersion =
      channel && Array.isArray(version.channelVersions)
        ? version.channelVersions[0]
        : undefined;
    return this.view(version, channelVersion);
  }

  async overview(userId: string, botId: string): Promise<GreeterOverview> {
    const bot = await this.admin.requireBot(userId, botId);
    const config = await this.versions.ensureConfig(bot.workspaceId, bot.id);
    const channels = await this.prisma.greeterChannel.findMany({
      where: { workspaceId: bot.workspaceId, botIntegrationId: bot.id },
      include: {
        channel: { select: { id: true, title: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const access = await this.prisma.telegramChannelSourceAccess.findMany({
      where: {
        workspaceId: bot.workspaceId,
        sourceId: bot.id,
        sourceType: TelegramSourceType.BOT,
        channelId: { in: channels.map((item) => item.channelId) },
      },
    });
    const accessByChannel = new Map(
      access.map((item) => [item.channelId, item]),
    );
    const [acquisitions, approved] = await Promise.all([
      this.prisma.greeterJoinRequest.findMany({
        where: {
          workspaceId: bot.workspaceId,
          botIntegrationId: bot.id,
          environment: GreeterAutomationEnvironment.PRODUCTION,
        },
        select: {
          telegramBotUserId: true,
          captchaPassedAt: true,
          status: true,
          telegramUser: { select: { startedAt: true, blockedAt: true } },
        },
      }),
      this.prisma.greeterJoinRequest.count({
        where: {
          workspaceId: bot.workspaceId,
          botIntegrationId: bot.id,
          environment: GreeterAutomationEnvironment.PRODUCTION,
          status: 'APPROVED',
        },
      }),
    ]);
    const acquiredUsers = new Map<
      string,
      { blocked: boolean; alive: boolean }
    >();
    for (const item of acquisitions) {
      const prior = acquiredUsers.get(item.telegramBotUserId);
      acquiredUsers.set(item.telegramBotUserId, {
        blocked: Boolean(item.telegramUser.blockedAt),
        alive: Boolean(
          prior?.alive ||
          item.telegramUser.startedAt ||
          item.captchaPassedAt ||
          item.status === 'APPROVED',
        ),
      });
    }
    const acquired = acquiredUsers.size;
    const blocked = [...acquiredUsers.values()].filter(
      (item) => item.blocked,
    ).length;
    const alive = [...acquiredUsers.values()].filter(
      (item) => !item.blocked && item.alive,
    ).length;
    const didNotInteract = acquired - blocked - alive;
    const publishedVersion = config.currentPublishedVersionId
      ? await this.prisma.greeterConfigVersion.findUnique({
          where: { id: config.currentPublishedVersionId },
          include: { channelVersions: true },
        })
      : null;
    const publishedChannels = new Map(
      (publishedVersion?.channelVersions ?? []).map((item) => [
        item.greeterChannelId,
        item,
      ]),
    );
    const runtimes = bot.runtimeInstances ?? [];
    const runtime =
      runtimes.find(
        (item) =>
          item.environment === process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT,
      ) ??
      runtimes.find((item) => item.environment === 'PRODUCTION') ??
      runtimes[0];
    return {
      bot: {
        id: bot.id,
        label: bot.label,
        username: runtime?.username ?? null,
        applicationType: bot.applicationType,
        runtimeStatus: runtime?.runtimeStatus ?? 'DISABLED',
        webhookStatus: runtime?.webhookStatus ?? 'NOT_CONFIGURED',
        lastRuntimeError: runtime?.lastRuntimeError ?? null,
      },
      config: this.view(config),
      publishedConfig: publishedVersion
        ? this.view(publishedVersion)
        : this.view(config),
      configuration: {
        draftRevision: config.draftRevision,
        publishedRevision: config.publishedRevision ?? 0,
        publishedAt: publishedVersion?.publishedAt.toISOString() ?? null,
        hasUnpublishedChanges:
          config.publishedRevision !== config.draftRevision,
      },
      channels: channels.map((item) => {
        const row = accessByChannel.get(item.channelId);
        const canInviteUsers = Boolean(row?.canInviteUsers);
        return {
          id: item.id,
          channel: item.channel,
          enabled: item.enabled,
          useGlobalConfig: item.useGlobalConfig,
          permissionHealth: {
            status: item.permissionError
              ? 'ERROR'
              : !row
                ? 'UNKNOWN'
                : canInviteUsers
                  ? 'CONNECTED'
                  : 'MISSING_PERMISSIONS',
            canInviteUsers: item.permissionError ? false : canInviteUsers,
            missingPermissions:
              canInviteUsers && !item.permissionError
                ? []
                : ['can_invite_users'],
            lastCheckedAt: row?.lastCheckedAt?.toISOString() ?? null,
            error: item.permissionError,
          },
          override: Object.fromEntries(
            configFields.flatMap((key) =>
              item[key] == null ? [] : [[key, item[key]]],
            ),
          ),
          effectiveConfig: this.view(config, item),
          publishedUseGlobalConfig:
            publishedChannels.get(item.id)?.useGlobalConfig ?? true,
          publishedOverride: Object.fromEntries(
            configFields.flatMap((key) => {
              const published = publishedChannels.get(item.id);
              return published?.[key] == null ? [] : [[key, published[key]]];
            }),
          ),
          publishedEffectiveConfig: publishedVersion
            ? this.view(publishedVersion, publishedChannels.get(item.id))
            : this.view(config, item),
        };
      }),
      metrics: { acquired, alive, blocked, didNotInteract, approved },
    };
  }

  async updateConfig(
    userId: string,
    botId: string,
    input: Partial<GreeterConfigInput>,
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    this.validateConfig(input);
    const config = await this.versions.ensureConfig(bot.workspaceId, bot.id);
    const updated = await this.prisma.greeterConfig.updateMany({
      where: { id: config.id, draftRevision: config.draftRevision },
      data: { ...input, draftRevision: { increment: 1 } },
    });
    if (updated.count !== 1)
      throw new ConflictException('Greeter configuration changed; reload');
    return this.prisma.greeterConfig.findUniqueOrThrow({
      where: { id: config.id },
    });
  }

  async publishConfig(userId: string, botId: string, expectedRevision: number) {
    const bot = await this.admin.requireBot(userId, botId);
    const config = await this.versions.ensureConfig(bot.workspaceId, bot.id);
    if (config.draftRevision !== expectedRevision) {
      throw new ConflictException('Greeter configuration changed; reload');
    }
    if (config.publishedRevision === expectedRevision) {
      return this.overview(userId, botId);
    }
    await this.versions.publish(config);
    return this.overview(userId, botId);
  }

  private async refresh(
    bot: Awaited<ReturnType<GreeterAdminService['requireBot']>>,
    channel: { id: string; telegramChatId: string | null },
  ) {
    if (!channel.telegramChatId)
      throw new BadRequestException('Telegram channel chat id is unavailable');
    try {
      const environment =
        process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT === 'LOCAL'
          ? 'LOCAL'
          : process.env.TELEGRAM_BOT_RUNTIME_ENVIRONMENT === 'PRODUCTION' ||
              process.env.NODE_ENV === 'production'
            ? 'PRODUCTION'
            : null;
      const runtime = environment
        ? (bot.runtimeInstances ?? []).find(
            (item) => item.environment === environment,
          )
        : null;
      if (!runtime) throw new Error('Telegram bot runtime is not enabled');
      const token = this.token(runtime);
      const me = await this.botApi.getMe(token);
      const raw = await this.botApi.getChatMember(
        token,
        channel.telegramChatId,
        String(me.id),
      );
      const normalized = this.sourceAccess.normalizeBotPermissions(raw);
      return this.sourceAccess.upsertAccess({
        workspaceId: bot.workspaceId,
        channelId: channel.id,
        sourceId: bot.id,
        sourceType: TelegramSourceType.BOT,
        role: normalized.role,
        permissions: normalized.permissions,
        rawPermissions: raw,
      });
    } catch (error) {
      throw new BadRequestException(
        sanitizeOperationalError(
          error,
          'Telegram permissions could not be refreshed',
        ),
      );
    }
  }

  async connectChannel(userId: string, botId: string, channelId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId: bot.workspaceId },
      select: { id: true, telegramChatId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const access = await this.refresh(bot, channel);
    if (!access.canInviteUsers)
      throw new ForbiddenException(
        'The bot needs Telegram can_invite_users permission to receive and decide join requests',
      );
    await this.prisma.greeterConfig.upsert({
      where: { botIntegrationId: bot.id },
      create: { workspaceId: bot.workspaceId, botIntegrationId: bot.id },
      update: {},
    });
    return this.prisma.greeterChannel.upsert({
      where: {
        botIntegrationId_channelId: { botIntegrationId: bot.id, channelId },
      },
      create: {
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        channelId,
      },
      update: { enabled: true, permissionError: null },
    });
  }

  async updateChannel(
    userId: string,
    botId: string,
    greeterChannelId: string,
    input: GreeterChannelOverrideInput,
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    this.validateConfig(input);
    const existing = await this.prisma.greeterChannel.findFirst({
      where: {
        id: greeterChannelId,
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
      },
    });
    if (!existing) throw new NotFoundException('Greeter channel not found');
    const config = await this.versions.ensureConfig(bot.workspaceId, bot.id);
    return this.prisma.$transaction(async (tx) => {
      const fenced = await tx.greeterConfig.updateMany({
        where: { id: config.id, draftRevision: config.draftRevision },
        data: { draftRevision: { increment: 1 } },
      });
      if (fenced.count !== 1)
        throw new ConflictException('Greeter configuration changed; reload');
      return tx.greeterChannel.update({
        where: { id: existing.id },
        data: input,
      });
    });
  }

  async deleteChannel(userId: string, botId: string, greeterChannelId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const removed = await this.prisma.greeterChannel.deleteMany({
      where: {
        id: greeterChannelId,
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
      },
    });
    if (!removed.count)
      throw new NotFoundException('Greeter channel not found');
    return { deleted: true };
  }

  async refreshChannelPermissions(
    userId: string,
    botId: string,
    greeterChannelId: string,
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    const item = await this.prisma.greeterChannel.findFirst({
      where: {
        id: greeterChannelId,
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
      },
      include: { channel: { select: { id: true, telegramChatId: true } } },
    });
    if (!item) throw new NotFoundException('Greeter channel not found');
    try {
      const access = await this.refresh(bot, item.channel);
      await this.prisma.greeterChannel.update({
        where: { id: item.id },
        data: { permissionError: null },
      });
      return access;
    } catch (error) {
      const message = sanitizeOperationalError(
        error,
        'Telegram permissions could not be refreshed',
      );
      await this.prisma.greeterChannel.update({
        where: { id: item.id },
        data: { permissionError: message },
      });
      throw new BadRequestException(message);
    }
  }

  async previewTemplate(
    userId: string,
    botId: string,
    input: {
      template: string;
      buttons?: GreeterButtonRows;
      context?: GreeterTemplateContextInput;
    },
  ): Promise<GreeterTemplatePreview> {
    return this.previews.preview(userId, botId, input);
  }
}

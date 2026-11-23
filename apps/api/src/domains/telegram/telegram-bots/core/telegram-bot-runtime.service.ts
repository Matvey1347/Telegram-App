import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  Prisma,
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { TelegramBotApplicationDispatcherService } from './telegram-bot-application-dispatcher.service';
import { TelegramBotRuntimeEnvironmentService } from './telegram-bot-runtime-environment.service';
import { TelegramBotRuntimeExecutionContext } from './telegram-bot-runtime-execution-context';
import { TelegramBotIdentityService } from './telegram-bot-identity.service';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeUserPresentationService } from './telegram-bot-runtime-user-presentation.service';
import { TelegramBotRuntimeRefreshService } from './telegram-bot-runtime-refresh.service';
import {
  type RegisteredTelegramBotRuntime,
  TelegramBotRuntimeRegistryService,
} from './telegram-bot-runtime-registry.service';
import type { TelegramBotWebhookUpdate } from './telegram-bot-update.types';
import {
  deploymentValue,
  publicApiOrigin,
} from '../../../../config/deployment-config';
import { dispatchTelegramBotWebhook } from './telegram-bot-webhook-dispatch';
import { assertSafeTelegramWebhookBase } from './telegram-bot-webhook-url';

@Injectable()
export class TelegramBotRuntimeService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly botApi: TelegramBotApiClient,
    private readonly dispatcher: TelegramBotApplicationDispatcherService,
    private readonly environment: TelegramBotRuntimeEnvironmentService,
    private readonly registry: TelegramBotRuntimeRegistryService,
    private readonly executionContext: TelegramBotRuntimeExecutionContext,
    private readonly presentation: TelegramBotRuntimePresentationService,
    private readonly identity: TelegramBotIdentityService,
    private readonly userPresentation: TelegramBotRuntimeUserPresentationService,
    private readonly refresh: TelegramBotRuntimeRefreshService,
  ) {}

  async onModuleInit() {
    const environment = this.environment.current();
    if (!environment) {
      this.logger.log(
        'Workspace Telegram bot startup is disabled until TELEGRAM_BOT_RUNTIME_ENVIRONMENT is set.',
      );
      return;
    }
    if (
      environment === TelegramBotRuntimeEnvironment.LOCAL &&
      deploymentValue('LOCAL_DEV_BOTS_CONTROL_SECRET')
    ) {
      this.logger.log(
        'Workspace Telegram bot startup is deferred until the local development runner activates it after the API is ready.',
      );
      return;
    }
    const transitions = await this.prisma.telegramBotRuntimeInstance.findMany({
      where: {
        environment,
        runtimeStatus: TelegramBotRuntimeStatus.STARTING,
        runtimeTransitionStartedAt: { not: null },
      },
      include: { botIntegration: true },
    });
    for (const runtime of transitions) await this.recoverTransition(runtime);
    await this.reconcileRuntimeEnvironment(environment);
  }

  async reconcileLocalDevelopment() {
    if (this.environment.current() !== TelegramBotRuntimeEnvironment.LOCAL)
      return;
    await this.reconcileRuntimeEnvironment(TelegramBotRuntimeEnvironment.LOCAL);
  }

  webhookUrlFor(runtimeId: string, environment = this.requiredEnvironment()) {
    const base = publicApiOrigin() || '';
    if (!base) {
      throw new BadRequestException(
        'Telegram bot webhook base URL is not configured',
      );
    }
    assertSafeTelegramWebhookBase(base, environment);
    return `${base.endsWith('/api') ? base : `${base}/api`}/telegram/bots/runtime/${runtimeId}/webhook`;
  }

  async configureRuntime(input: {
    botIntegrationId: string;
    environment: TelegramBotRuntimeEnvironment;
    token: string;
  }) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({
      where: { id: input.botIntegrationId },
      select: { id: true, workspaceId: true },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const existing = await this.findRuntime(
      input.botIntegrationId,
      input.environment,
    );
    if (
      existing?.runtimeStatus === TelegramBotRuntimeStatus.ACTIVE &&
      this.environment.owns(input.environment)
    ) {
      // The owner can safely detach its old webhook before replacing the token.
      // A non-owner only stores the replacement as disabled for its owner to activate.
      await this.botApi.deleteWebhook(this.decryptToken(existing));
    }
    const identity = await this.botApi.getMe(input.token);
    if (!identity.id)
      throw new BadRequestException('Invalid Telegram bot token');
    await this.identity.ensureAvailable(
      bot.workspaceId,
      String(identity.id),
      existing?.id,
    );
    const encrypted = this.encryption.encrypt(input.token);
    const runtime = await this.prisma.telegramBotRuntimeInstance.upsert({
      where: {
        botIntegrationId_environment: {
          botIntegrationId: input.botIntegrationId,
          environment: input.environment,
        },
      },
      create: {
        botIntegrationId: input.botIntegrationId,
        workspaceId: bot.workspaceId,
        environment: input.environment,
        botTokenEncrypted: encrypted.encrypted,
        botTokenIv: encrypted.iv,
        botTokenAuthTag: encrypted.authTag,
        botTokenMasked: this.maskToken(input.token),
        botId: String(identity.id),
        username: identity.username || null,
        firstName: identity.first_name || null,
        lastCheckedAt: new Date(),
      },
      update: {
        botTokenEncrypted: encrypted.encrypted,
        botTokenIv: encrypted.iv,
        botTokenAuthTag: encrypted.authTag,
        botTokenMasked: this.maskToken(input.token),
        botId: String(identity.id),
        username: identity.username || null,
        firstName: identity.first_name || null,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
        runtimeStatus: TelegramBotRuntimeStatus.DISABLED,
        webhookStatus: TelegramBotWebhookStatus.NOT_CONFIGURED,
        webhookUrl: null,
        webhookSecretEncrypted: null,
        webhookSecretIv: null,
        webhookSecretAuthTag: null,
        webhookConfiguredAt: null,
        pendingWebhookUrl: null,
        pendingWebhookSecretEncrypted: null,
        pendingWebhookSecretIv: null,
        pendingWebhookSecretAuthTag: null,
        runtimeTransitionStartedAt: null,
        lastRuntimeError: null,
      },
    });
    if (this.environment.owns(input.environment)) {
      await this.registry.refresh(runtime.id, input.environment);
    }
    return runtime;
  }

  ownsEnvironment(environment: TelegramBotRuntimeEnvironment) {
    return this.environment.owns(environment);
  }

  canAutoEnable(environment: TelegramBotRuntimeEnvironment) {
    if (!this.environment.owns(environment)) return false;
    try {
      this.webhookUrlFor('__runtime_probe__', environment);
      return true;
    } catch {
      return false;
    }
  }

  forgetRuntime(runtimeId: string) {
    this.registry.invalidate(runtimeId);
  }

  async enableRuntime(input: {
    botIntegrationId: string;
    environment: TelegramBotRuntimeEnvironment;
  }) {
    this.assertOwned(input.environment);
    const runtime = await this.runtimeWithBot(
      input.botIntegrationId,
      input.environment,
    );
    if (
      runtime.botIntegration.applicationType === TelegramBotApplicationType.NONE
    ) {
      throw new BadRequestException(
        'Select a bot application before enabling the runtime',
      );
    }
    if (runtime.runtimeStatus === TelegramBotRuntimeStatus.STARTING) {
      throw new ConflictException(
        'Telegram bot runtime transition is in progress',
      );
    }
    const token = this.decryptToken(runtime);
    const url = this.webhookUrlFor(runtime.id, input.environment);
    const secret = randomBytes(32).toString('base64url');
    const encrypted = this.encryption.encrypt(secret);
    const startedAt = new Date();
    const acquired = await this.prisma.telegramBotRuntimeInstance.updateMany({
      where: {
        id: runtime.id,
        environment: input.environment,
        runtimeStatus: runtime.runtimeStatus,
        runtimeTransitionStartedAt: null,
      },
      data: {
        runtimeStatus: TelegramBotRuntimeStatus.STARTING,
        pendingWebhookUrl: url,
        pendingWebhookSecretEncrypted: encrypted.encrypted,
        pendingWebhookSecretIv: encrypted.iv,
        pendingWebhookSecretAuthTag: encrypted.authTag,
        runtimeTransitionStartedAt: startedAt,
        lastRuntimeError: null,
      },
    });
    if (acquired.count !== 1) {
      throw new ConflictException(
        'Telegram bot runtime transition is in progress',
      );
    }
    this.registry.invalidate(runtime.id);
    try {
      await this.botApi.setWebhook(
        token,
        url,
        secret,
        this.allowedUpdates(runtime),
      );
      const presentation = await this.presentation.reconcile(
        token,
        runtime.botIntegration.applicationType,
        runtime.botIntegrationId,
      );
      const finalized = await this.prisma.telegramBotRuntimeInstance.updateMany(
        {
          where: {
            id: runtime.id,
            environment: input.environment,
            runtimeStatus: TelegramBotRuntimeStatus.STARTING,
            runtimeTransitionStartedAt: startedAt,
          },
          data: {
            runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
            webhookStatus: TelegramBotWebhookStatus.CONFIGURED,
            webhookUrl: url,
            webhookSecretEncrypted: encrypted.encrypted,
            webhookSecretIv: encrypted.iv,
            webhookSecretAuthTag: encrypted.authTag,
            webhookConfiguredAt: new Date(),
            pendingWebhookUrl: null,
            pendingWebhookSecretEncrypted: null,
            pendingWebhookSecretIv: null,
            pendingWebhookSecretAuthTag: null,
            runtimeTransitionStartedAt: null,
            lastRuntimeError: null,
            ...this.reconciledPresentationData(presentation),
          },
        },
      );
      if (finalized.count !== 1) {
        throw new ConflictException(
          'Telegram bot runtime transition was superseded',
        );
      }
      return (await this.registry.refresh(runtime.id, input.environment))!
        .runtime;
    } catch (error) {
      await this.markError(runtime.id, input.environment, error, true);
      await this.prisma.telegramBotRuntimeInstance.updateMany({
        where: { id: runtime.id, environment: input.environment },
        data: {
          pendingWebhookUrl: null,
          pendingWebhookSecretEncrypted: null,
          pendingWebhookSecretIv: null,
          pendingWebhookSecretAuthTag: null,
          runtimeTransitionStartedAt: null,
        },
      });
      throw new BadRequestException(sanitizeOperationalError(error));
    }
  }

  async disableRuntime(
    botIntegrationId: string,
    environment = this.requiredEnvironment(),
  ) {
    this.assertOwned(environment);
    const runtime = await this.runtimeWithBot(botIntegrationId, environment);
    const token = this.decryptToken(runtime);
    try {
      if (runtime.webhookStatus !== TelegramBotWebhookStatus.NOT_CONFIGURED) {
        await this.botApi.deleteWebhook(token);
      }
      await this.presentation.reconcile(
        token,
        TelegramBotApplicationType.NONE,
        runtime.botIntegrationId,
      );
      const disabled = await this.prisma.telegramBotRuntimeInstance.update({
        where: { id: runtime.id },
        data: {
          runtimeStatus: TelegramBotRuntimeStatus.DISABLED,
          webhookStatus: TelegramBotWebhookStatus.NOT_CONFIGURED,
          webhookUrl: null,
          webhookSecretEncrypted: null,
          webhookSecretIv: null,
          webhookSecretAuthTag: null,
          webhookConfiguredAt: null,
          pendingWebhookUrl: null,
          pendingWebhookSecretEncrypted: null,
          pendingWebhookSecretIv: null,
          pendingWebhookSecretAuthTag: null,
          runtimeTransitionStartedAt: null,
          lastRuntimeError: null,
        },
      });
      this.registry.invalidate(runtime.id);
      return disabled;
    } catch (error) {
      await this.markError(runtime.id, environment, error);
      throw error;
    }
  }

  async removeRuntime(
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    this.assertOwned(environment);
    const runtime = await this.runtimeWithBot(botIntegrationId, environment);
    if (runtime.webhookStatus !== TelegramBotWebhookStatus.NOT_CONFIGURED) {
      await this.botApi.deleteWebhook(this.decryptToken(runtime));
    }
    await this.prisma.telegramBotRuntimeInstance.delete({
      where: { id: runtime.id },
    });
    this.registry.invalidate(runtime.id);
    return { id: runtime.id, environment };
  }

  async checkRuntime(
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    this.assertOwned(environment);
    const runtime = await this.runtimeWithBot(botIntegrationId, environment);
    const token = this.decryptToken(runtime);
    return this.refresh.refresh(runtime, token);
  }

  async reconcilePresentation(runtimeId: string) {
    const environment = this.requiredEnvironment();
    const entry = await this.registry.refresh(runtimeId, environment);
    if (
      !entry ||
      entry.runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE
    )
      return;
    const presentation = await this.presentation.reconcile(
      entry.token,
      entry.runtime.botIntegration.applicationType,
      entry.runtime.botIntegrationId,
    );
    await this.prisma.telegramBotRuntimeInstance.update({
      where: { id: runtimeId },
      data: this.reconciledPresentationData(presentation),
    });
    await this.registry.refresh(runtimeId, environment);
  }

  async handleWebhook(
    runtimeId: string,
    secretHeader: string | undefined,
    update: TelegramBotWebhookUpdate,
  ) {
    return dispatchTelegramBotWebhook(
      {
        prisma: this.prisma,
        encryption: this.encryption,
        dispatcher: this.dispatcher,
        registry: this.registry,
        executionContext: this.executionContext,
        logger: this.logger,
      },
      this.requiredEnvironment(),
      runtimeId,
      secretHeader,
      update,
    );
  }

  private async reconcileStartupRuntime(entry: RegisteredTelegramBotRuntime) {
    const runtime = entry.runtime;
    try {
      const expectedUrl = this.webhookUrlFor(runtime.id, runtime.environment);
      const actualUrl = this.webhookUrl(
        await this.botApi.getWebhookInfo(entry.token),
      );
      // Telegram's getWebhookInfo omits the secret token. Reapply the
      // production webhook on startup so a rotated or stale secret cannot
      // leave an apparently healthy URL rejecting every update.
      if (
        runtime.environment === TelegramBotRuntimeEnvironment.PRODUCTION ||
        actualUrl !== expectedUrl
      ) {
        await this.botApi.setWebhook(
          entry.token,
          expectedUrl,
          this.decryptSecret(runtime),
          this.allowedUpdates(runtime),
        );
      }
      const presentation = await this.presentation.reconcile(
        entry.token,
        runtime.botIntegration.applicationType,
        runtime.botIntegrationId,
      );
      await this.reconcileUserPresentation(runtime, entry.token);
      const miniAppUrl = presentation?.miniAppUrl ?? null;
      if (
        runtime.webhookStatus !== TelegramBotWebhookStatus.CONFIGURED ||
        runtime.webhookUrl !== expectedUrl ||
        runtime.lastRuntimeError ||
        (presentation !== undefined &&
          (runtime.miniAppExpectedUrl !== miniAppUrl ||
            runtime.miniAppActualUrl !== miniAppUrl))
      ) {
        await this.prisma.telegramBotRuntimeInstance.updateMany({
          where: { id: runtime.id, environment: runtime.environment },
          data: {
            webhookStatus: TelegramBotWebhookStatus.CONFIGURED,
            webhookUrl: expectedUrl,
            webhookConfiguredAt:
              actualUrl === expectedUrl
                ? runtime.webhookConfiguredAt
                : new Date(),
            lastRuntimeError: null,
            ...this.reconciledPresentationData(presentation),
          },
        });
        await this.registry.refresh(runtime.id, runtime.environment);
      }
    } catch (error) {
      await this.markError(runtime.id, runtime.environment, error);
    }
  }

  private async reconcileRuntimeEnvironment(
    environment: TelegramBotRuntimeEnvironment,
  ) {
    const runtimes = await this.registry.bootstrap(environment);
    this.logger.log(
      `Reconciling ${runtimes.length} ${environment} Telegram bot runtime(s).`,
    );
    for (const entry of runtimes) await this.reconcileStartupRuntime(entry);
    if (environment === TelegramBotRuntimeEnvironment.LOCAL) {
      await this.activateSavedLocalRuntimes();
    }
  }

  private reconcileUserPresentation(
    runtime: RegisteredTelegramBotRuntime['runtime'],
    token: string,
  ) {
    return this.userPresentation.reconcile({
      runtimeId: runtime.id,
      botIntegrationId: runtime.botIntegrationId,
      applicationType: runtime.botIntegration.applicationType,
      token,
    });
  }

  /**
   * `pnpm dev:bots` deliberately owns LOCAL only. A saved local token must
   * become live on that bounded process startup; otherwise it would remain
   * DISABLED forever when it was saved before the dev process was started.
   */
  private async activateSavedLocalRuntimes() {
    const runtimes = await this.prisma.telegramBotRuntimeInstance.findMany({
      where: {
        environment: TelegramBotRuntimeEnvironment.LOCAL,
        runtimeStatus: TelegramBotRuntimeStatus.DISABLED,
        botIntegration: {
          isActive: true,
          applicationType: { not: TelegramBotApplicationType.NONE },
        },
      },
      select: { botIntegrationId: true },
    });
    for (const runtime of runtimes) {
      try {
        await this.enableRuntime({
          botIntegrationId: runtime.botIntegrationId,
          environment: TelegramBotRuntimeEnvironment.LOCAL,
        });
      } catch (error) {
        this.logger.warn(
          `Unable to activate saved LOCAL runtime ${runtime.botIntegrationId}: ${sanitizeOperationalError(error)}`,
        );
      }
    }
  }

  private async recoverTransition(
    runtime: Prisma.TelegramBotRuntimeInstanceGetPayload<{
      include: { botIntegration: true };
    }>,
  ) {
    const startedAt = runtime.runtimeTransitionStartedAt;
    if (!startedAt) return;
    try {
      const token = this.decryptToken(runtime);
      if (
        runtime.botIntegration.applicationType ===
        TelegramBotApplicationType.NONE
      ) {
        await this.botApi.deleteWebhook(token);
        await this.presentation.reconcile(
          token,
          TelegramBotApplicationType.NONE,
          runtime.botIntegrationId,
        );
        await this.prisma.telegramBotRuntimeInstance.updateMany({
          where: { id: runtime.id, runtimeTransitionStartedAt: startedAt },
          data: {
            runtimeStatus: TelegramBotRuntimeStatus.DISABLED,
            webhookStatus: TelegramBotWebhookStatus.NOT_CONFIGURED,
            webhookUrl: null,
            webhookSecretEncrypted: null,
            webhookSecretIv: null,
            webhookSecretAuthTag: null,
            pendingWebhookUrl: null,
            pendingWebhookSecretEncrypted: null,
            pendingWebhookSecretIv: null,
            pendingWebhookSecretAuthTag: null,
            runtimeTransitionStartedAt: null,
          },
        });
        return;
      }
      if (
        !runtime.pendingWebhookUrl ||
        !runtime.pendingWebhookSecretEncrypted ||
        !runtime.pendingWebhookSecretIv ||
        !runtime.pendingWebhookSecretAuthTag
      ) {
        throw new Error('Pending Telegram webhook transition is incomplete');
      }
      const secret = this.encryption.decrypt({
        encrypted: runtime.pendingWebhookSecretEncrypted,
        iv: runtime.pendingWebhookSecretIv,
        authTag: runtime.pendingWebhookSecretAuthTag,
      });
      await this.botApi.setWebhook(
        token,
        runtime.pendingWebhookUrl,
        secret,
        this.allowedUpdates(runtime),
      );
      const presentation = await this.presentation.reconcile(
        token,
        runtime.botIntegration.applicationType,
        runtime.botIntegrationId,
      );
      await this.prisma.telegramBotRuntimeInstance.updateMany({
        where: { id: runtime.id, runtimeTransitionStartedAt: startedAt },
        data: {
          runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
          webhookStatus: TelegramBotWebhookStatus.CONFIGURED,
          webhookUrl: runtime.pendingWebhookUrl,
          webhookSecretEncrypted: runtime.pendingWebhookSecretEncrypted,
          webhookSecretIv: runtime.pendingWebhookSecretIv,
          webhookSecretAuthTag: runtime.pendingWebhookSecretAuthTag,
          webhookConfiguredAt: new Date(),
          pendingWebhookUrl: null,
          pendingWebhookSecretEncrypted: null,
          pendingWebhookSecretIv: null,
          pendingWebhookSecretAuthTag: null,
          runtimeTransitionStartedAt: null,
          lastRuntimeError: null,
          ...this.reconciledPresentationData(presentation),
        },
      });
    } catch (error) {
      // Keep STARTING + pending credentials recoverable for the next bounded
      // startup attempt; only its observed webhook state becomes ERROR.
      await this.markError(runtime.id, runtime.environment, error);
    }
  }

  private reconciledPresentationData(
    presentation:
      | {
          miniAppUrl: string | null;
        }
      | undefined,
  ) {
    return presentation?.miniAppUrl
      ? {
          miniAppStatus: 'CONFIGURED',
          miniAppExpectedUrl: presentation.miniAppUrl,
          miniAppActualUrl: presentation.miniAppUrl,
          miniAppError: null,
        }
      : {
          miniAppStatus: 'NOT_CONFIGURED',
          miniAppExpectedUrl: null,
          miniAppActualUrl: null,
          miniAppError: null,
        };
  }

  private findRuntime(
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    return this.prisma.telegramBotRuntimeInstance.findUnique({
      where: {
        botIntegrationId_environment: { botIntegrationId, environment },
      },
    });
  }

  private async runtimeWithBot(
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    const runtime = await this.prisma.telegramBotRuntimeInstance.findUnique({
      where: {
        botIntegrationId_environment: { botIntegrationId, environment },
      },
      include: { botIntegration: true },
    });
    if (!runtime) throw new NotFoundException('Telegram bot runtime not found');
    return runtime;
  }

  private assertOwned(environment: TelegramBotRuntimeEnvironment) {
    if (!this.environment.owns(environment)) {
      throw new ForbiddenException(
        `This API process does not own the ${environment} runtime environment`,
      );
    }
  }

  private requiredEnvironment() {
    const environment = this.environment.current();
    if (!environment) {
      throw new ForbiddenException(
        'Workspace Telegram bot runtime is disabled',
      );
    }
    return environment;
  }

  private decryptToken(runtime: {
    botTokenEncrypted: string;
    botTokenIv: string;
    botTokenAuthTag: string;
  }) {
    return this.encryption.decrypt({
      encrypted: runtime.botTokenEncrypted,
      iv: runtime.botTokenIv,
      authTag: runtime.botTokenAuthTag,
    });
  }

  private decryptSecret(runtime: {
    webhookSecretEncrypted: string | null;
    webhookSecretIv: string | null;
    webhookSecretAuthTag: string | null;
  }) {
    if (
      !runtime.webhookSecretEncrypted ||
      !runtime.webhookSecretIv ||
      !runtime.webhookSecretAuthTag
    ) {
      throw new Error('Telegram bot webhook secret is not configured');
    }
    return this.encryption.decrypt({
      encrypted: runtime.webhookSecretEncrypted,
      iv: runtime.webhookSecretIv,
      authTag: runtime.webhookSecretAuthTag,
    });
  }

  private webhookUrl(info: Record<string, unknown> | null) {
    return typeof info?.url === 'string' ? info.url : null;
  }

  private maskToken(token: string) {
    return token.length <= 8
      ? '••••••••'
      : `${token.slice(0, 4)}••••${token.slice(-4)}`;
  }

  private allowedUpdates(runtime: RegisteredTelegramBotRuntime['runtime']) {
    if (
      runtime.botIntegration.applicationType === TelegramBotApplicationType.FINANCE
    ) {
      // Telegram retains the previous update filter when a webhook omits it.
      return ['message', 'callback_query', 'pre_checkout_query'] as const;
    }
    return undefined;
  }

  private async markError(
    runtimeId: string,
    environment: TelegramBotRuntimeEnvironment,
    error: unknown,
    runtimeError = false,
  ) {
    const message = sanitizeOperationalError(error);
    const current = await this.prisma.telegramBotRuntimeInstance.findFirst({
      where: { id: runtimeId, environment },
      select: {
        runtimeStatus: true,
        webhookStatus: true,
        lastRuntimeError: true,
      },
    });
    if (
      current &&
      ((runtimeError &&
        current.runtimeStatus !== TelegramBotRuntimeStatus.ERROR) ||
        current.webhookStatus !== TelegramBotWebhookStatus.ERROR ||
        current.lastRuntimeError !== message)
    ) {
      await this.prisma.telegramBotRuntimeInstance.updateMany({
        where: { id: runtimeId, environment },
        data: {
          ...(runtimeError
            ? { runtimeStatus: TelegramBotRuntimeStatus.ERROR }
            : {}),
          webhookStatus: TelegramBotWebhookStatus.ERROR,
          lastRuntimeError: message,
        },
      });
    }
    this.registry.invalidate(runtimeId);
    this.logger.error(`Telegram runtime ${runtimeId} failed: ${message}`);
  }
}

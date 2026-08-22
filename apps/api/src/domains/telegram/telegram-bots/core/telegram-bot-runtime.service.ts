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
  TelegramBotUpdateStatus,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import { TelegramBotApplicationDispatcherService } from './telegram-bot-application-dispatcher.service';
import { TelegramBotRuntimeEnvironmentService } from './telegram-bot-runtime-environment.service';
import { TelegramBotRuntimeExecutionContext } from './telegram-bot-runtime-execution-context';
import { TelegramBotIdentityService } from './telegram-bot-identity.service';
import { TelegramBotRuntimePresentationService } from './telegram-bot-runtime-presentation.service';
import { TelegramBotRuntimeCheckService } from './telegram-bot-runtime-check.service';
import {
  type RegisteredTelegramBotRuntime,
  TelegramBotRuntimeRegistryService,
} from './telegram-bot-runtime-registry.service';
import type { TelegramBotWebhookUpdate } from './telegram-bot-update.types';

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
    private readonly checks: TelegramBotRuntimeCheckService,
  ) {}

  async onModuleInit() {
    const environment = this.environment.current();
    if (!environment) {
      this.logger.log(
        'Workspace Telegram bot startup is disabled until TELEGRAM_BOT_RUNTIME_ENVIRONMENT is set.',
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
    const base = (
      process.env.TELEGRAM_BOT_WEBHOOK_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.PUBLIC_API_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');
    if (!base) {
      throw new BadRequestException(
        'Telegram bot webhook base URL is not configured',
      );
    }
    this.assertSafeWebhookBase(base, environment);
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
      await this.botApi.setWebhook(token, url, secret);
      await this.presentation.reconcile(
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
    const [identity, webhookInfo, presentation] = await Promise.all([
      this.botApi.getMe(token),
      runtime.runtimeStatus === TelegramBotRuntimeStatus.ACTIVE
        ? this.botApi.getWebhookInfo(token)
        : Promise.resolve(null),
      this.checks.presentation(
        token,
        runtime.botIntegrationId,
        runtime.botIntegration.applicationType ===
          TelegramBotApplicationType.FINANCE,
      ),
    ]);
    const actualUrl = this.webhookUrl(webhookInfo);
    const webhookStatus =
      runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE
        ? TelegramBotWebhookStatus.NOT_CONFIGURED
        : actualUrl === runtime.webhookUrl
          ? TelegramBotWebhookStatus.CONFIGURED
          : actualUrl
            ? TelegramBotWebhookStatus.ERROR
            : TelegramBotWebhookStatus.NOT_CONFIGURED;
    const checked = await this.prisma.telegramBotRuntimeInstance.update({
      where: { id: runtime.id },
      data: {
        botId: String(identity.id),
        username: identity.username || null,
        firstName: identity.first_name || null,
        lastCheckedAt: new Date(),
        lastErrorMessage: null,
        webhookStatus,
        lastRuntimeError:
          webhookStatus === TelegramBotWebhookStatus.ERROR
            ? 'Telegram is delivering updates to a different webhook URL.'
            : null,
        webAppStatus: presentation.webApp.status,
        webAppUrl: presentation.webApp.url,
        webAppError: presentation.webApp.error,
        miniAppStatus: presentation.miniApp.status,
        miniAppExpectedUrl: presentation.miniApp.expectedUrl,
        miniAppActualUrl: presentation.miniApp.actualUrl,
        miniAppError: presentation.miniApp.error,
      },
    });
    await this.registry.refresh(runtime.id, environment);
    return checked;
  }

  async reconcilePresentation(runtimeId: string) {
    const environment = this.requiredEnvironment();
    const entry = await this.registry.refresh(runtimeId, environment);
    if (
      !entry ||
      entry.runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE
    )
      return;
    await this.presentation.reconcile(
      entry.token,
      entry.runtime.botIntegration.applicationType,
      entry.runtime.botIntegrationId,
    );
  }

  async handleWebhook(
    runtimeId: string,
    secretHeader: string | undefined,
    update: TelegramBotWebhookUpdate,
  ) {
    const startedAt = Date.now();
    const entry = await this.registry.resolve(
      runtimeId,
      this.requiredEnvironment(),
    );
    if (!entry) throw new NotFoundException('Telegram bot runtime not found');
    this.assertWebhook(entry, secretHeader);
    if (update.update_id == null) {
      throw new BadRequestException('Telegram update_id is required');
    }
    const claimed = await this.claimUpdate(
      entry,
      String(update.update_id),
      update,
    );
    if (claimed.duplicate) return { ok: true, duplicate: true };
    const claimedAt = Date.now();
    try {
      const result = await this.executionContext.run(runtimeId, () =>
        this.dispatcher.dispatch({
          bot: entry.runtime.botIntegration,
          runtime: entry.runtime,
          token: entry.token,
          update,
          updateLogId: claimed.log.id,
        }),
      );
      const status = result.handled
        ? TelegramBotUpdateStatus.PROCESSED
        : TelegramBotUpdateStatus.SKIPPED;
      const dispatchedAt = Date.now();
      await this.prisma.telegramBotUpdateLog.update({
        where: { id: claimed.log.id },
        data: { status, processedAt: new Date(), error: null },
      });
      const totalMs = Date.now() - startedAt;
      if (totalMs >= 1_000)
        this.logger.warn(JSON.stringify({ event: 'telegram_bot.slow_webhook', runtimeId, applicationType: entry.runtime.botIntegration.applicationType, claimMs: claimedAt - startedAt, dispatchMs: dispatchedAt - claimedAt, finalizeMs: Date.now() - dispatchedAt, totalMs }));
      return { ok: true, duplicate: false, status };
    } catch (error) {
      await this.prisma.telegramBotUpdateLog.update({
        where: { id: claimed.log.id },
        data: {
          status: TelegramBotUpdateStatus.FAILED,
          processedAt: new Date(),
          error: sanitizeOperationalError(error),
        },
      });
      return {
        ok: false,
        duplicate: false,
        status: TelegramBotUpdateStatus.FAILED,
      };
    }
  }

  private async reconcileStartupRuntime(entry: RegisteredTelegramBotRuntime) {
    const runtime = entry.runtime;
    try {
      const expectedUrl = this.webhookUrlFor(runtime.id, runtime.environment);
      const actualUrl = this.webhookUrl(
        await this.botApi.getWebhookInfo(entry.token),
      );
      if (actualUrl !== expectedUrl) {
        await this.botApi.setWebhook(
          entry.token,
          expectedUrl,
          this.decryptSecret(runtime),
        );
      }
      await this.presentation.reconcile(
        entry.token,
        runtime.botIntegration.applicationType,
        runtime.botIntegrationId,
      );
      if (
        runtime.webhookStatus !== TelegramBotWebhookStatus.CONFIGURED ||
        runtime.webhookUrl !== expectedUrl ||
        runtime.lastRuntimeError
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
    for (const entry of runtimes) await this.reconcileStartupRuntime(entry);
    if (environment === TelegramBotRuntimeEnvironment.LOCAL) {
      await this.activateSavedLocalRuntimes();
    }
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
      await this.botApi.setWebhook(token, runtime.pendingWebhookUrl, secret);
      await this.presentation.reconcile(
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
        },
      });
    } catch (error) {
      // Keep STARTING + pending credentials recoverable for the next bounded
      // startup attempt; only its observed webhook state becomes ERROR.
      await this.markError(runtime.id, runtime.environment, error);
    }
  }

  private async claimUpdate(
    entry: RegisteredTelegramBotRuntime,
    updateId: string,
    update: TelegramBotWebhookUpdate,
  ) {
    try {
      const log = await this.prisma.telegramBotUpdateLog.create({
        data: {
          workspaceId: entry.runtime.botIntegration.workspaceId,
          botIntegrationId: entry.runtime.botIntegrationId,
          runtimeInstanceId: entry.runtime.id,
          updateId,
          updateType: this.updateType(update),
          status: TelegramBotUpdateStatus.PROCESSING,
        },
      });
      return { log, duplicate: false };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const log = await this.prisma.telegramBotUpdateLog.findUnique({
        where: {
          runtimeInstanceId_updateId: {
            runtimeInstanceId: entry.runtime.id,
            updateId,
          },
        },
      });
      if (!log) throw error;
      if (log.status !== TelegramBotUpdateStatus.PROCESSING) {
        return { log, duplicate: true };
      }
      const reclaimed = await this.prisma.telegramBotUpdateLog.updateMany({
        where: {
          id: log.id,
          status: TelegramBotUpdateStatus.PROCESSING,
          updatedAt: { lt: new Date(Date.now() - 5 * 60_000) },
        },
        data: { processedAt: null, error: null },
      });
      return { log, duplicate: reclaimed.count !== 1 };
    }
  }

  private assertWebhook(
    entry: RegisteredTelegramBotRuntime,
    candidate: string | undefined,
  ) {
    const { runtime } = entry;
    if (
      (runtime.runtimeStatus !== TelegramBotRuntimeStatus.ACTIVE &&
        runtime.runtimeStatus !== TelegramBotRuntimeStatus.STARTING) ||
      !runtime.botIntegration.isActive ||
      runtime.botIntegration.applicationType === TelegramBotApplicationType.NONE
    ) {
      throw new ForbiddenException('Telegram bot runtime is not active');
    }
    if (!candidate)
      throw new ForbiddenException('Invalid Telegram webhook secret');
    const actual = Buffer.from(candidate);
    const credentials = [
      {
        encrypted: runtime.webhookSecretEncrypted,
        iv: runtime.webhookSecretIv,
        authTag: runtime.webhookSecretAuthTag,
      },
      {
        encrypted: runtime.pendingWebhookSecretEncrypted,
        iv: runtime.pendingWebhookSecretIv,
        authTag: runtime.pendingWebhookSecretAuthTag,
      },
    ];
    for (const credential of credentials) {
      if (!credential.encrypted || !credential.iv || !credential.authTag)
        continue;
      const expected = Buffer.from(
        this.encryption.decrypt({
          encrypted: credential.encrypted,
          iv: credential.iv,
          authTag: credential.authTag,
        }),
      );
      if (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      ) {
        return;
      }
    }
    throw new ForbiddenException('Invalid Telegram webhook secret');
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

  private assertSafeWebhookBase(
    base: string,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    let url: URL;
    try {
      url = new URL(base);
    } catch {
      throw new BadRequestException(
        'Telegram bot webhook base URL must be an absolute HTTPS URL',
      );
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException(
        'Telegram bot webhook base URL must use HTTPS',
      );
    }
    if (environment !== TelegramBotRuntimeEnvironment.PRODUCTION) return;

    const host = url.hostname.toLowerCase();
    const localHost =
      host === 'localhost' || host === '::1' || host === '127.0.0.1';
    const developmentTunnelHost =
      host === 'ngrok.io' ||
      host.endsWith('.ngrok.io') ||
      host === 'ngrok-free.app' ||
      host.endsWith('.ngrok-free.app') ||
      host === 'trycloudflare.com' ||
      host.endsWith('.trycloudflare.com');
    if (localHost || developmentTunnelHost) {
      throw new BadRequestException(
        'Production Telegram webhooks cannot use localhost or development tunnel URLs',
      );
    }
  }

  private updateType(update: TelegramBotWebhookUpdate) {
    if (update.message) return 'message';
    if (update.callback_query) return 'callback_query';
    if (update.pre_checkout_query) return 'pre_checkout_query';
    if (update.chat_join_request) return 'chat_join_request';
    return 'unknown';
  }

  private maskToken(token: string) {
    return token.length <= 8
      ? '••••••••'
      : `${token.slice(0, 4)}••••${token.slice(-4)}`;
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

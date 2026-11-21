import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  type Logger,
} from '@nestjs/common';
import {
  Prisma,
  TelegramBotApplicationType,
  TelegramBotRuntimeStatus,
  TelegramBotUpdateStatus,
  type TelegramBotRuntimeEnvironment,
} from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import type { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import type { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramBotApplicationDispatcherService } from './telegram-bot-application-dispatcher.service';
import type { TelegramBotRuntimeExecutionContext } from './telegram-bot-runtime-execution-context';
import type {
  RegisteredTelegramBotRuntime,
  TelegramBotRuntimeRegistryService,
} from './telegram-bot-runtime-registry.service';
import type { TelegramBotWebhookUpdate } from './telegram-bot-update.types';

type WebhookDependencies = {
  prisma: PrismaService;
  encryption: TokenEncryptionService;
  dispatcher: TelegramBotApplicationDispatcherService;
  registry: TelegramBotRuntimeRegistryService;
  executionContext: TelegramBotRuntimeExecutionContext;
  logger: Logger;
};

export async function dispatchTelegramBotWebhook(
  dependencies: WebhookDependencies,
  environment: TelegramBotRuntimeEnvironment,
  runtimeId: string,
  secretHeader: string | undefined,
  update: TelegramBotWebhookUpdate,
) {
  const startedAt = Date.now();
  const entry = await dependencies.registry.resolve(runtimeId, environment);
  if (!entry) throw new NotFoundException('Telegram bot runtime not found');
  assertWebhook(dependencies.encryption, entry, secretHeader);
  if (update.update_id == null) {
    throw new BadRequestException('Telegram update_id is required');
  }
  const claimed = await claimUpdate(
    dependencies.prisma,
    entry,
    String(update.update_id),
    update,
  );
  if (claimed.duplicate) return { ok: true, duplicate: true };
  const claimedAt = Date.now();
  try {
    const result = await dependencies.executionContext.run(runtimeId, () =>
      dependencies.dispatcher.dispatch({
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
    await dependencies.prisma.telegramBotUpdateLog.update({
      where: { id: claimed.log.id },
      data: { status, processedAt: new Date(), error: null },
    });
    const totalMs = Date.now() - startedAt;
    if (totalMs >= 1_000)
      dependencies.logger.warn(
        JSON.stringify({
          event: 'telegram_bot.slow_webhook',
          runtimeId,
          applicationType: entry.runtime.botIntegration.applicationType,
          claimMs: claimedAt - startedAt,
          dispatchMs: dispatchedAt - claimedAt,
          finalizeMs: Date.now() - dispatchedAt,
          totalMs,
        }),
      );
    return { ok: true, duplicate: false, status };
  } catch (error) {
    await dependencies.prisma.telegramBotUpdateLog.update({
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

async function claimUpdate(
  prisma: PrismaService,
  entry: RegisteredTelegramBotRuntime,
  updateId: string,
  update: TelegramBotWebhookUpdate,
) {
  try {
    const log = await prisma.telegramBotUpdateLog.create({
      data: {
        workspaceId: entry.runtime.botIntegration.workspaceId,
        botIntegrationId: entry.runtime.botIntegrationId,
        runtimeInstanceId: entry.runtime.id,
        updateId,
        updateType: updateType(update),
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
    const log = await prisma.telegramBotUpdateLog.findUnique({
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
    const reclaimed = await prisma.telegramBotUpdateLog.updateMany({
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

function assertWebhook(
  encryption: TokenEncryptionService,
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
      encryption.decrypt({
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

function updateType(update: TelegramBotWebhookUpdate) {
  if (update.message) return 'message';
  if (update.callback_query) return 'callback_query';
  if (update.pre_checkout_query) return 'pre_checkout_query';
  if (update.chat_join_request) return 'chat_join_request';
  return 'unknown';
}

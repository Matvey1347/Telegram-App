import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  TelegramBotRuntimeEnvironment,
  TelegramBotWebhookStatus,
} from '@prisma/client';
import { AppModule } from '../app.module';
import { TelegramBotRuntimeService } from '../domains/telegram/telegram-bots/core/telegram-bot-runtime.service';

function required(config: ConfigService, name: string) {
  const value = config.get<string>(name)?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

type FinanceRuntimeService = Pick<
  TelegramBotRuntimeService,
  'configureRuntime' | 'enableRuntime'
>;

export async function configureFinanceProductionRuntime(
  runtime: FinanceRuntimeService,
  input: { botIntegrationId: string; token: string },
) {
  const configured = await runtime.configureRuntime({
    botIntegrationId: input.botIntegrationId,
    environment: TelegramBotRuntimeEnvironment.PRODUCTION,
    token: input.token,
  });
  const active = await runtime.enableRuntime({
    botIntegrationId: configured.botIntegrationId,
    environment: TelegramBotRuntimeEnvironment.PRODUCTION,
  });

  return {
    runtimeId: active.id,
    environment: active.environment,
    status: active.runtimeStatus,
    username: active.username,
    webhookConfigured:
      active.webhookStatus === TelegramBotWebhookStatus.CONFIGURED,
  };
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const runtime = await app.resolve(TelegramBotRuntimeService);
    const config = app.get(ConfigService);
    const summary = await configureFinanceProductionRuntime(runtime, {
      botIntegrationId: required(config, 'FINANCE_BOT_INTEGRATION_ID'),
      token: required(config, 'FINANCE_PRODUCTION_RUNTIME_TOKEN'),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  run().catch(() => {
    process.stderr.write('Finance production runtime configuration failed. Check protected settings and runtime status.\n');
    process.exitCode = 1;
  });
}

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeStatus,
} from '@prisma/client';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';

const runtimeWithBot = {
  botIntegration: true,
} satisfies Prisma.TelegramBotRuntimeInstanceInclude;

export type RegisteredTelegramBotRuntime = {
  runtime: Prisma.TelegramBotRuntimeInstanceGetPayload<{
    include: typeof runtimeWithBot;
  }>;
  token: string;
};

/**
 * Narrow process-local credential cache. It is filled once for the process-owned
 * environment and refreshed by runtime mutations; a webhook cache miss performs
 * one environment-scoped database lookup.
 */
@Injectable()
export class TelegramBotRuntimeRegistryService {
  private readonly runtimes = new Map<string, RegisteredTelegramBotRuntime>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async bootstrap(environment: TelegramBotRuntimeEnvironment) {
    const rows = await this.prisma.telegramBotRuntimeInstance.findMany({
      where: {
        environment,
        runtimeStatus: TelegramBotRuntimeStatus.ACTIVE,
        botIntegration: {
          isActive: true,
          applicationType: { not: TelegramBotApplicationType.NONE },
        },
      },
      include: runtimeWithBot,
    });
    this.runtimes.clear();
    for (const runtime of rows) this.store(runtime);
    return rows.map((runtime) => this.runtimes.get(runtime.id)!);
  }

  async resolve(
    runtimeId: string,
    environment: TelegramBotRuntimeEnvironment,
  ): Promise<RegisteredTelegramBotRuntime | null> {
    const cached = this.runtimes.get(runtimeId);
    if (cached?.runtime.environment === environment) return cached;
    const runtime = await this.prisma.telegramBotRuntimeInstance.findFirst({
      where: { id: runtimeId, environment },
      include: runtimeWithBot,
    });
    return runtime ? this.store(runtime) : null;
  }

  async refresh(runtimeId: string, environment: TelegramBotRuntimeEnvironment) {
    this.invalidate(runtimeId);
    return this.resolve(runtimeId, environment);
  }

  invalidate(runtimeId: string) {
    this.runtimes.delete(runtimeId);
  }

  private store(
    runtime: Prisma.TelegramBotRuntimeInstanceGetPayload<{
      include: typeof runtimeWithBot;
    }>,
  ) {
    const entry = {
      runtime,
      token: this.encryption.decrypt({
        encrypted: runtime.botTokenEncrypted,
        iv: runtime.botTokenIv,
        authTag: runtime.botTokenAuthTag,
      }),
    };
    this.runtimes.set(runtime.id, entry);
    return entry;
  }
}

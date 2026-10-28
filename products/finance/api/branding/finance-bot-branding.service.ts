import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  WorkspaceRole,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { financeBrandImage } from '../../assets/brand-assets';
import { WorkspaceService } from '@api/common/workspace.service';
import { PrismaService } from '@api/prisma/prisma.service';
import { TelegramBotProfileService } from '@api/domains/telegram/telegram-bots/core/telegram-bot-profile.service';
import { FinanceConsumerRuntimeEnvironmentService } from '@consumer-finance/api/identity/finance-consumer-runtime-environment.service';

@Injectable()
export class FinanceBotBrandingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly profiles: TelegramBotProfileService,
    private readonly environments: FinanceConsumerRuntimeEnvironmentService,
  ) {}

  async onModuleInit() {
    const environment = this.environments.current();
    if (!environment) return;
    const image = financeBrandImage(environment);
    const assetHash = createHash('sha256').update(image).digest('hex');
    const runtimes = await this.prisma.telegramBotRuntimeInstance.findMany({
      where: { environment, botIntegration: { applicationType: TelegramBotApplicationType.FINANCE } },
      select: { id: true, botIntegrationId: true, profileAssetHash: true },
    });
    for (const runtime of runtimes) {
      if (runtime.profileAssetHash === assetHash) continue;
      try {
        await this.profiles.update(runtime.botIntegrationId, environment, {
          avatar: { buffer: image, mimetype: 'image/png' } as Express.Multer.File,
        });
        await this.prisma.telegramBotRuntimeInstance.update({
          where: { id: runtime.id }, data: { profileAssetHash: assetHash },
        });
      } catch {
        // The next process start retries this bounded reconciliation.
      }
    }
  }

  async update(
    userId: string,
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
    input: { name?: string },
  ) {
    const membership = await this.workspace.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        id: botIntegrationId,
        workspaceId: membership.workspaceId,
        applicationType: TelegramBotApplicationType.FINANCE,
      },
      select: { id: true },
    });
    if (!bot) throw new NotFoundException('Finance bot not found');
    const runtime = await this.prisma.telegramBotRuntimeInstance.findFirst({
      where: {
        botIntegrationId,
        workspaceId: membership.workspaceId,
        environment,
      },
      select: { id: true },
    });
    if (!runtime) throw new NotFoundException('Finance bot runtime not found');
    if (!input.name?.trim()) throw new BadRequestException('Bot name is required');
    await this.profiles.update(botIntegrationId, environment, { name: input.name });
  }

  async asset(
    botIntegrationId: string,
    kind: 'favicon' | 'favicon-light',
    requestedEnvironment?: TelegramBotRuntimeEnvironment,
  ) {
    const environment = requestedEnvironment ?? this.environments.current();
    if (!environment) throw new NotFoundException('Finance bot runtime not found');
    void botIntegrationId;
    return {
      bytes: financeBrandImage(environment, kind === 'favicon-light' ? 'dark' : 'light'),
      contentType: 'image/png',
      updatedAt: null,
    };
  }
}

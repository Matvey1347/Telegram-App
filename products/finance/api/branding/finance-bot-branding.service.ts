import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  WorkspaceRole,
} from '@prisma/client';
import sharp from 'sharp';
import { WorkspaceService } from '@api/common/workspace.service';
import { PrismaService } from '@api/prisma/prisma.service';
import { TelegramBotProfileService } from '@api/domains/telegram/telegram-bots/core/telegram-bot-profile.service';
import { FinanceConsumerRuntimeEnvironmentService } from '@consumer-finance/api/identity/finance-consumer-runtime-environment.service';

@Injectable()
export class FinanceBotBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly profiles: TelegramBotProfileService,
    private readonly environments: FinanceConsumerRuntimeEnvironmentService,
  ) {}

  async update(
    userId: string,
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
    input: {
      name?: string;
      favicon?: Express.Multer.File;
      faviconLight?: Express.Multer.File;
    },
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
    if (!input.name?.trim() && !input.favicon && !input.faviconLight) {
      throw new BadRequestException('Bot name or branding image is required');
    }

    let favicon: Buffer | undefined;
    if (input.favicon) {
      if (!input.favicon.mimetype.startsWith('image/')) {
        throw new BadRequestException('Finance favicon must be an image');
      }
      favicon = await sharp(input.favicon.buffer)
        .rotate()
        .resize(440, 440, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extend({ top: 36, bottom: 36, left: 36, right: 36, background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
    }

    let faviconLight: Buffer | undefined;
    if (input.faviconLight) {
      if (!input.faviconLight.mimetype.startsWith('image/')) {
        throw new BadRequestException('Light finance favicon must be an image');
      }
      faviconLight = await sharp(input.faviconLight.buffer)
        .rotate()
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
    }

    if (input.name?.trim() || favicon) {
      await this.profiles.update(botIntegrationId, environment, {
        name: input.name,
        avatar: favicon ? { buffer: favicon, mimetype: 'image/png' } as Express.Multer.File : undefined,
      });
    }

    if (favicon || faviconLight) {
      await this.prisma.telegramBotRuntimeInstance.update({
        where: { id: runtime.id },
        data: {
          ...(favicon
            ? {
                financeFaviconImage: Uint8Array.from(favicon),
                financeFaviconMimeType: 'image/png',
              }
            : {}),
          ...(faviconLight
            ? {
                financeFaviconLightImage: Uint8Array.from(faviconLight),
                financeFaviconLightMimeType: 'image/png',
              }
            : {}),
          financeBrandingUpdatedAt: new Date(),
        },
      });
    }
  }

  async asset(
    botIntegrationId: string,
    kind: 'favicon' | 'favicon-light',
    requestedEnvironment?: TelegramBotRuntimeEnvironment,
  ) {
    const environment = requestedEnvironment ?? this.environments.current();
    if (!environment) throw new NotFoundException('Finance bot runtime not found');
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        id: botIntegrationId,
        applicationType: TelegramBotApplicationType.FINANCE,
      },
      select: {
        runtimeInstances: {
          where: {
            environment,
          },
          select: {
            avatarImage: true,
            avatarMimeType: true,
            avatarUpdatedAt: true,
            financeFaviconImage: true,
            financeFaviconMimeType: true,
            financeFaviconLightImage: true,
            financeFaviconLightMimeType: true,
            financeBrandingUpdatedAt: true,
          },
          take: 1,
        },
      },
    });
    const runtime = bot?.runtimeInstances[0];
    const bytes = kind === 'favicon-light'
      ? (runtime?.financeFaviconLightImage ?? runtime?.financeFaviconImage ?? runtime?.avatarImage)
      : (runtime?.financeFaviconImage ?? runtime?.avatarImage);
    if (!bytes) throw new NotFoundException('Finance branding asset not found');
    return {
      bytes: Buffer.from(bytes),
      contentType: (kind === 'favicon-light' && runtime?.financeFaviconLightImage
        ? runtime.financeFaviconLightMimeType
        : runtime?.financeFaviconImage ? runtime.financeFaviconMimeType : runtime?.avatarMimeType) || 'image/png',
      updatedAt: runtime?.financeFaviconImage || runtime?.financeFaviconLightImage
        ? runtime.financeBrandingUpdatedAt : runtime?.avatarUpdatedAt,
    };
  }
}

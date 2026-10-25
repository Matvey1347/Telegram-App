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
      logo?: Express.Multer.File;
      favicon?: Express.Multer.File;
      telegramPhoto?: Express.Multer.File;
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
    if (!input.name?.trim() && !input.logo && !input.favicon && !input.telegramPhoto) {
      throw new BadRequestException('Bot name or branding image is required');
    }

    let favicon: Buffer | undefined;
    if (input.favicon) {
      if (!input.favicon.mimetype.startsWith('image/')) {
        throw new BadRequestException('Finance favicon must be an image');
      }
      favicon = await sharp(input.favicon.buffer)
        .rotate()
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    }

    let logo: { bytes: Buffer; mimeType: string } | undefined;
    if (input.logo) {
      if (!input.logo.mimetype.startsWith('image/')) {
        throw new BadRequestException('Finance logo must be an image');
      }
      logo = {
        bytes: await sharp(input.logo.buffer)
          .rotate()
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toBuffer(),
        mimeType: 'image/png',
      };
    }

    if (input.name?.trim() || input.telegramPhoto) {
      await this.profiles.update(botIntegrationId, environment, {
        name: input.name,
        avatar: input.telegramPhoto,
      });
    }

    if (logo || favicon) {
      await this.prisma.telegramBotRuntimeInstance.update({
        where: { id: runtime.id },
        data: {
          ...(logo
            ? {
                financeLogoImage: Uint8Array.from(logo.bytes),
                financeLogoMimeType: logo.mimeType,
              }
            : {}),
          ...(favicon
            ? {
                financeFaviconImage: Uint8Array.from(favicon),
                financeFaviconMimeType: 'image/png',
              }
            : {}),
          financeBrandingUpdatedAt: new Date(),
        },
      });
    }
  }

  async asset(
    botIntegrationId: string,
    kind: 'logo' | 'favicon' | 'telegram',
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
            financeLogoImage: true,
            financeLogoMimeType: true,
            financeFaviconImage: true,
            financeFaviconMimeType: true,
            financeBrandingUpdatedAt: true,
          },
          take: 1,
        },
      },
    });
    const runtime = bot?.runtimeInstances[0];
    const bytes = kind === 'logo'
      ? (runtime?.financeLogoImage ?? runtime?.avatarImage)
      : kind === 'favicon' ? runtime?.financeFaviconImage : runtime?.avatarImage;
    if (!bytes) throw new NotFoundException('Finance branding asset not found');
    return {
      bytes: Buffer.from(bytes),
      contentType:
        (kind === 'logo'
          ? (runtime?.financeLogoImage ? runtime.financeLogoMimeType : runtime?.avatarMimeType)
          : kind === 'favicon' ? runtime?.financeFaviconMimeType : runtime?.avatarMimeType) || 'image/png',
      updatedAt:
        kind === 'logo'
          ? (runtime?.financeLogoImage ? runtime.financeBrandingUpdatedAt : runtime?.avatarUpdatedAt)
          : kind === 'favicon' ? runtime?.financeBrandingUpdatedAt : runtime?.avatarUpdatedAt,
    };
  }
}

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
import { WorkspaceService } from '../../../../common/workspace.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotProfileService } from '../../telegram-bots/core/telegram-bot-profile.service';

@Injectable()
export class FinanceBotBrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly profiles: TelegramBotProfileService,
  ) {}

  async update(
    userId: string,
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
    input: {
      name?: string;
      logo?: Express.Multer.File;
      favicon?: Express.Multer.File;
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
    if (!input.name?.trim() && !input.logo && !input.favicon) {
      throw new BadRequestException('Bot name, logo, or favicon is required');
    }

    let favicon: Buffer | undefined;
    if (input.favicon) {
      if (!input.favicon.mimetype.startsWith('image/')) {
        throw new BadRequestException('Finance favicon must be an image');
      }
      favicon = await sharp(input.favicon.buffer)
        .rotate()
        .resize(128, 128, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    }

    let logo: { bytes: Buffer; mimeType: string } | undefined;
    if (input.name?.trim() || input.logo) {
      const runtime = await this.profiles.update(
        botIntegrationId,
        environment,
        {
          name: input.name,
          avatar: input.logo,
        },
      );
      if (input.logo && runtime.avatarImage) {
        logo = {
          bytes: Buffer.from(runtime.avatarImage),
          mimeType: runtime.avatarMimeType || 'image/jpeg',
        };
      }
    }

    if (logo || favicon) {
      await this.prisma.telegramBotIntegration.update({
        where: { id: botIntegrationId },
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

  async asset(botIntegrationId: string, kind: 'logo' | 'favicon') {
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        id: botIntegrationId,
        applicationType: TelegramBotApplicationType.FINANCE,
      },
      select: {
        financeLogoImage: true,
        financeLogoMimeType: true,
        financeFaviconImage: true,
        financeFaviconMimeType: true,
        financeBrandingUpdatedAt: true,
      },
    });
    const bytes =
      kind === 'logo' ? bot?.financeLogoImage : bot?.financeFaviconImage;
    if (!bytes) throw new NotFoundException('Finance branding asset not found');
    return {
      bytes: Buffer.from(bytes),
      contentType:
        (kind === 'logo'
          ? bot?.financeLogoMimeType
          : bot?.financeFaviconMimeType) || 'image/png',
      updatedAt: bot?.financeBrandingUpdatedAt,
    };
  }
}

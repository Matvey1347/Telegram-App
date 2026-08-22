import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import sharp from 'sharp';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@Injectable()
export class TelegramBotProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly botApi: TelegramBotApiClient,
  ) {}

  async sync(botIntegrationId: string, environment: TelegramBotRuntimeEnvironment) {
    const runtime = await this.runtime(botIntegrationId, environment);
    const token = this.token(runtime);
    const [name, photos] = await Promise.all([
      this.botApi.getMyName(token),
      this.botApi.getUserProfilePhotos(token, String(runtime.botId)),
    ]);
    const largest = photos.photos?.[0]?.at(-1);
    const data: Record<string, unknown> = {};
    const currentName = name.name?.trim();
    if (currentName && currentName !== runtime.firstName) data.firstName = currentName;
    if (largest?.file_id) {
      if (largest.file_id !== runtime.avatarTelegramFileId) {
        const file = await this.botApi.getFile(token, largest.file_id);
        if (!file.file_path) throw new BadRequestException('Telegram bot avatar file is unavailable');
        const downloaded = await this.botApi.downloadFile(token, file.file_path, MAX_AVATAR_BYTES);
        Object.assign(data, {
          avatarImage: Uint8Array.from(downloaded.bytes),
          avatarMimeType: downloaded.contentType,
          avatarTelegramFileId: largest.file_id,
          avatarUpdatedAt: new Date(),
        });
      }
    } else if (runtime.avatarImage || runtime.avatarTelegramFileId) {
      Object.assign(data, {
        avatarImage: null,
        avatarMimeType: null,
        avatarTelegramFileId: null,
        avatarUpdatedAt: null,
      });
    }
    if (!Object.keys(data).length) return runtime;
    return this.prisma.telegramBotRuntimeInstance.update({
      where: { id: runtime.id },
      data,
    });
  }

  async update(
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
    input: { name?: string; avatar?: Express.Multer.File },
  ) {
    const runtime = await this.runtime(botIntegrationId, environment);
    const token = this.token(runtime);
    const name = input.name?.trim();
    if (!name && !input.avatar) {
      throw new BadRequestException('Bot name or profile photo is required');
    }
    let avatarData: Record<string, unknown> = {};
    if (input.avatar) {
      if (!input.avatar.mimetype.startsWith('image/')) {
        throw new BadRequestException('Bot profile photo must be an image');
      }
      const jpeg = await sharp(input.avatar.buffer)
        .rotate()
        .resize(512, 512, {
          fit: 'contain',
          background: { r: 5, g: 8, b: 12, alpha: 1 },
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      await this.botApi.setMyProfilePhoto(token, jpeg);
      avatarData = {
        avatarImage: Uint8Array.from(jpeg),
        avatarMimeType: 'image/jpeg',
        avatarTelegramFileId: null,
        avatarUpdatedAt: new Date(),
      };
    }
    if (name) await this.botApi.setMyName(token, name);
    return this.prisma.telegramBotRuntimeInstance.update({
      where: { id: runtime.id },
      data: { ...(name ? { firstName: name } : {}), ...avatarData },
    });
  }

  async avatar(runtimeId: string) {
    const runtime = await this.prisma.telegramBotRuntimeInstance.findUnique({
      where: { id: runtimeId },
      select: { avatarImage: true, avatarMimeType: true, avatarUpdatedAt: true },
    });
    if (!runtime?.avatarImage) throw new NotFoundException('Bot avatar not found');
    return {
      bytes: Buffer.from(runtime.avatarImage),
      contentType: runtime.avatarMimeType || 'image/jpeg',
      updatedAt: runtime.avatarUpdatedAt,
    };
  }

  private async runtime(
    botIntegrationId: string,
    environment: TelegramBotRuntimeEnvironment,
  ) {
    const runtime = await this.prisma.telegramBotRuntimeInstance.findUnique({
      where: { botIntegrationId_environment: { botIntegrationId, environment } },
    });
    if (!runtime?.botId) throw new NotFoundException('Telegram bot runtime not found');
    return runtime;
  }

  private token(runtime: {
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
}

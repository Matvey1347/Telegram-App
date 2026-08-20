import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class TelegramBotIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAvailable(
    workspaceId: string,
    telegramBotId: string,
    excludedRuntimeId?: string,
  ) {
    const duplicate = await this.prisma.telegramBotRuntimeInstance.findFirst({
      where: {
        workspaceId,
        botId: telegramBotId,
        ...(excludedRuntimeId
          ? { id: { not: excludedRuntimeId } }
          : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        'This Telegram bot is already connected to this workspace',
      );
    }
  }

  deduplicate<T extends { id: string }>(rows: T[]) {
    return rows;
  }

  recordsForBot(input: {
    id: string;
    workspaceId: string;
    runtimeInstances?: Array<{ id: string; botId: string | null; webhookStatus: string }>;
  }) {
    return Promise.resolve(input.runtimeInstances ?? []);
  }
}

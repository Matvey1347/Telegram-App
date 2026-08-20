import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramBotApiClient } from './telegram-bot-api.client';

@Injectable()
export class TelegramSystemBotDirectMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly api: TelegramBotApiClient,
  ) {}

  async sendToUser(userId: string, text: string) {
    const message = text.trim();
    if (!message) throw new BadRequestException('Message text is required');
    if (message.length > 4096)
      throw new BadRequestException('Message must not exceed 4096 characters');
    const environment = this.config
      .get<string>('TELEGRAM_SYSTEM_BOT_ENVIRONMENT')
      ?.trim();
    const token =
      (environment === 'LOCAL' || environment === 'PRODUCTION'
        ? this.config.get<string>(`TELEGRAM_SYSTEM_BOT_${environment}_TOKEN`)
        : null
      )?.trim() || null;
    if (!token) throw new BadRequestException('System bot is not configured');
    const connection = await this.prisma.telegramSystemBotConnection.findFirst({
      where: { userId, enabled: true },
      select: { telegramChatId: true },
    });
    if (!connection)
      throw new BadRequestException(
        'Connect the system bot before sending a message',
      );
    await this.api.sendMessage(token, {
      chat_id: connection.telegramChatId,
      text: message,
    });
    return { status: 'SENT' as const };
  }
}

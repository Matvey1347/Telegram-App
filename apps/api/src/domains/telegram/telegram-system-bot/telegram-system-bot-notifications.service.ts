import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';

@Injectable()
export class TelegramSystemBotNotificationsService {
  private readonly logger = new Logger(
    TelegramSystemBotNotificationsService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly handler: TelegramSystemBotHandlerService,
  ) {}

  async sendToWorkspaceUser(input: {
    workspaceId: string;
    userId: string;
    text: string;
    parseMode?: string;
  }) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { telegramNotificationUserChatId: true },
    });
    if (!workspace?.telegramNotificationUserChatId)
      return { status: 'NOT_CONNECTED' as const };
    return this.handler.sendSystemMessage({
      chatId: workspace.telegramNotificationUserChatId,
      text: input.text,
      parseMode: input.parseMode,
    });
  }

  async sendToWorkspace(workspaceId: string, text: string, parseMode?: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { telegramNotificationChatId: true },
    });
    if (!workspace?.telegramNotificationChatId)
      return { status: 'NOT_CONNECTED' as const };
    return this.handler.sendSystemMessage({
      chatId: workspace.telegramNotificationChatId,
      text,
      parseMode,
    });
  }

  async notify(input: {
    taskKey: string;
    taskName: string;
    workspaceId: string | null;
    runId: string;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    resultSummary: string | null;
    durationMs: number;
    errorReason: string | null;
    details?: unknown;
  }) {
    if (!input.workspaceId || input.status !== 'FAILED')
      return { status: 'SKIPPED' as const, sent: 0 };
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true, telegramNotificationChatId: true },
    });
    if (!workspace?.telegramNotificationChatId)
      return { status: 'NOT_CONNECTED' as const, sent: 0 };
    const seconds = Math.max(0, Math.round(input.durationMs / 1000));
    try {
      const lines = [
        `🚨 ${input.taskName}`,
        `Рабочее пространство: ${workspace.name}`,
      ];
      lines.push(
        `Причина: ${sanitizeOperationalError(input.errorReason, 'Задача завершилась с ошибкой')}`,
      );
      lines.push(`Время: ${seconds} сек.`);
      const result = await this.handler.sendTaskNotification({
        chatId: workspace.telegramNotificationChatId,
        text: lines.join('\n'),
      });
      return { status: result.status, sent: result.status === 'SENT' ? 1 : 0 };
    } catch (error) {
      this.logger.warn(
        `System bot notification failed: ${sanitizeOperationalError(error)}`,
      );
      return { status: 'FAILED' as const, sent: 0 };
    }
  }
}

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
    if (!input.workspaceId || input.status === 'SKIPPED')
      return { status: 'SKIPPED' as const, sent: 0 };
    const subscriptions =
      await this.prisma.telegramSystemBotTaskSubscription.findMany({
        where: {
          workspaceId: input.workspaceId,
          taskKey: input.taskKey,
          ...(input.status === 'SUCCESS'
            ? { notifyOnSuccess: true }
            : { notifyOnFailure: true }),
          enabled: true,
          connection: {
            enabled: true,
            user: { memberships: { some: { workspaceId: input.workspaceId } } },
          },
        },
        select: { connection: { select: { telegramChatId: true } } },
      });
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true },
    });
    const seconds = Math.max(0, Math.round(input.durationMs / 1000));
    const lines = [
      `${input.status === 'SUCCESS' ? 'Completed' : 'Failed'}: ${input.taskName}`,
      `Workspace: ${workspace?.name ?? 'Unknown workspace'}`,
    ];
    if (input.status === 'SUCCESS' && input.resultSummary) {
      lines.push(
        sanitizeOperationalError(input.resultSummary, 'Task completed'),
      );
    }
    if (input.status === 'FAILED') {
      lines.push(
        `Reason: ${sanitizeOperationalError(input.errorReason, 'Task failed')}`,
      );
    }
    lines.push(`Duration: ${seconds}s`);
    const text = lines.join('\n');
    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        const result = await this.handler.sendTaskNotification({
          chatId: subscription.connection.telegramChatId,
          text,
        });
        if (result.status === 'SENT') sent += 1;
      } catch (error) {
        this.logger.warn(
          `System bot notification failed: ${sanitizeOperationalError(error)}`,
        );
      }
    }
    return { status: 'DELIVERED' as const, sent };
  }
}

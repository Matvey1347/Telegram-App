import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { translateSystemBotNotification as t } from './i18n/notifications';

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
        select: {
          connection: {
            select: {
              telegramChatId: true,
              user: { select: { locale: true } },
            },
          },
        },
      });
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true },
    });
    const seconds = Math.max(0, Math.round(input.durationMs / 1000));
    let sent = 0;
    for (const subscription of subscriptions) {
      try {
        const locale = subscription.connection.user.locale;
        const lines = [
          t(locale, input.status === 'SUCCESS' ? 'completed' : 'failed', {
            taskName: input.taskName,
          }),
          t(locale, 'workspace', {
            workspaceName:
              workspace?.name ?? t(locale, 'unknownWorkspace'),
          }),
        ];
        if (input.status === 'SUCCESS' && input.resultSummary) {
          lines.push(
            sanitizeOperationalError(
              input.resultSummary,
              t(locale, 'taskCompleted'),
            ),
          );
        }
        if (input.status === 'FAILED') {
          lines.push(
            t(locale, 'reason', {
              reason: sanitizeOperationalError(
                input.errorReason,
                t(locale, 'taskFailed'),
              ),
            }),
          );
        }
        lines.push(t(locale, 'duration', { seconds }));
        const result = await this.handler.sendTaskNotification({
          chatId: subscription.connection.telegramChatId,
          text: lines.join('\n'),
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

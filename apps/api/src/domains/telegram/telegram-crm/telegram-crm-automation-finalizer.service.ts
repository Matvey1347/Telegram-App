import { Injectable } from '@nestjs/common';
import {
  TelegramCrmDeliveryState,
  TelegramCrmMessageDirection,
  TelegramCrmMessageOrigin,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CrmAutomationExecutionRow } from './telegram-crm-automation-execution';
import { crmMessageSelect } from './telegram-crm-message.mapper';

@Injectable()
export class TelegramCrmAutomationFinalizerService {
  constructor(private readonly prisma: PrismaService) {}

  finalize(
    execution: CrmAutomationExecutionRow,
    ownerId: string,
    conversationId: string,
    accountId: string,
    sent: { telegramMessageId: number; sentAt: Date },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const echo = await tx.telegramCrmMessage.findUnique({
        where: {
          conversationId_telegramMessageId: {
            conversationId,
            telegramMessageId: String(sent.telegramMessageId),
          },
        },
        select: { id: true, origin: true, automationExecutionId: true },
      });
      if (
        echo &&
        echo.origin !== TelegramCrmMessageOrigin.TELEGRAM_SYNC &&
        !(
          echo.origin === TelegramCrmMessageOrigin.AUTOMATION &&
          echo.automationExecutionId === execution.id
        )
      ) {
        throw new Error(
          'Telegram echo is attributed to another message origin',
        );
      }
      const message = echo
        ? await tx.telegramCrmMessage.update({
            where: { id: echo.id },
            data: {
              origin: TelegramCrmMessageOrigin.AUTOMATION,
              direction: TelegramCrmMessageDirection.OUTBOUND,
              sentByMemberId: null,
              automationExecutionId: execution.id,
              clientIdempotencyKey: `automation:${execution.eventKey}`,
              telegramMessageIdNumeric: sent.telegramMessageId,
              mtprotoAccountId: accountId,
              text: execution.renderedText,
              sentAt: sent.sentAt,
              deliveryState: TelegramCrmDeliveryState.SENT,
            },
            select: crmMessageSelect,
          })
        : await tx.telegramCrmMessage.create({
            data: {
              workspaceId: execution.workspaceId,
              conversationId,
              telegramMessageId: String(sent.telegramMessageId),
              telegramMessageIdNumeric: sent.telegramMessageId,
              clientIdempotencyKey: `automation:${execution.eventKey}`,
              mtprotoAccountId: accountId,
              direction: TelegramCrmMessageDirection.OUTBOUND,
              origin: TelegramCrmMessageOrigin.AUTOMATION,
              sentByMemberId: null,
              automationExecutionId: execution.id,
              text: execution.renderedText,
              sentAt: sent.sentAt,
              deliveryState: TelegramCrmDeliveryState.SENT,
            },
            select: crmMessageSelect,
          });
      await tx.telegramCrmConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: sent.sentAt,
          lastOutboundAt: sent.sentAt,
          lastMeaningfulSyncAt: new Date(),
        },
      });
      await tx.telegramAdvertiser.update({
        where: { id: execution.contactId },
        data: { lastContactAt: sent.sentAt, lastOutboundAt: sent.sentAt },
      });
      const completed =
        await tx.telegramCrmCustomerAutomationExecution.updateMany({
          where: { id: execution.id, leaseOwner: ownerId, status: 'SENDING' },
          data: {
            status: 'SENT',
            completedAt: sent.sentAt,
            reason: 'ELIGIBLE',
            lastError: null,
            nextAttemptAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
      if (completed.count !== 1) {
        throw new Error('Automation execution lease was lost');
      }
      return message;
    });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramCrmMessageDirection,
  TelegramCrmMessageOrigin,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { StoreCrmMessageInput } from './telegram-crm.dto';
import { crmMessageSelect, mapCrmMessage } from './telegram-crm-message.mapper';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

@Injectable()
export class TelegramCrmMessageStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async store(input: StoreCrmMessageInput) {
    this.validateOrigin(input);
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const conversation = await tx.telegramCrmConversation.findFirst({
          where: {
            id: input.conversationId,
            workspaceId: input.workspaceId,
            mtprotoAccountId: input.mtprotoAccountId,
          },
          select: {
            id: true,
            contactId: true,
            lastMessageAt: true,
            lastInboundAt: true,
            lastOutboundAt: true,
            unreadCount: true,
          },
        });
        if (!conversation) {
          throw new BadRequestException(
            'Message Conversation and account do not match',
          );
        }
        await this.requireMember(tx, input.workspaceId, input.sentByMemberId);
        await this.requireAutomationExecution(
          tx,
          input.workspaceId,
          input.automationExecutionId,
          conversation.contactId,
        );
        const sentAt = new Date(input.sentAt);
        const created = await tx.telegramCrmMessage.create({
          data: {
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            telegramMessageId: input.telegramMessageId,
            mtprotoAccountId: input.mtprotoAccountId,
            direction: input.direction,
            origin: input.origin,
            sentByMemberId: input.sentByMemberId ?? null,
            automationExecutionId: input.automationExecutionId ?? null,
            text: input.text ?? null,
            contentMetadata:
              (input.contentMetadata as Prisma.InputJsonValue | undefined) ??
              Prisma.JsonNull,
            sentAt,
            editedAt: input.editedAt ? new Date(input.editedAt) : null,
          },
          select: crmMessageSelect,
        });
        const update = this.conversationUpdate(conversation, input, sentAt);
        if (Object.keys(update).length) {
          await tx.telegramCrmConversation.update({
            where: { id: conversation.id },
            data: update,
          });
        }
        return created;
      });
      return mapCrmMessage(row);
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const existing = await this.prisma.telegramCrmMessage.findUnique({
        where: {
          conversationId_telegramMessageId: {
            conversationId: input.conversationId,
            telegramMessageId: input.telegramMessageId,
          },
        },
        select: crmMessageSelect,
      });
      if (!existing || existing.workspaceId !== input.workspaceId) throw error;
      return mapCrmMessage(existing);
    }
  }

  private validateOrigin(input: StoreCrmMessageInput) {
    if (
      input.origin === TelegramCrmMessageOrigin.TELEGRAM_SYNC &&
      input.sentByMemberId
    ) {
      throw new BadRequestException(
        'Historical Telegram messages cannot be attributed to a Member',
      );
    }
    if (
      input.origin === TelegramCrmMessageOrigin.MANUAL &&
      !input.sentByMemberId
    ) {
      throw new BadRequestException('Manual messages require a sending Member');
    }
    if (
      input.origin === TelegramCrmMessageOrigin.AUTOMATION &&
      !input.automationExecutionId
    ) {
      throw new BadRequestException(
        'Automation messages require an idempotent execution',
      );
    }
    if (
      input.origin !== TelegramCrmMessageOrigin.AUTOMATION &&
      input.automationExecutionId
    ) {
      throw new BadRequestException(
        'Only Automation messages may reference an automation execution',
      );
    }
  }

  private async requireMember(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    memberId: string | null | undefined,
  ) {
    if (!memberId) return;
    const member = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId },
      select: { id: true },
    });
    if (!member)
      throw new BadRequestException('Sending Member is not in workspace');
  }

  private async requireAutomationExecution(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    automationExecutionId: string | null | undefined,
    contactId: string | null,
  ) {
    if (!automationExecutionId) return;
    if (!contactId) {
      throw new BadRequestException(
        'Automation messages require a Contact-linked Conversation',
      );
    }
    const execution = await tx.telegramCrmCustomerAutomationExecution.findFirst(
      {
        where: { id: automationExecutionId, workspaceId, contactId },
        select: { id: true },
      },
    );
    if (!execution) {
      throw new BadRequestException(
        'Automation execution does not match the message Contact',
      );
    }
  }

  private conversationUpdate(
    conversation: {
      lastMessageAt: Date | null;
      lastInboundAt: Date | null;
      lastOutboundAt: Date | null;
      unreadCount: number;
    },
    input: StoreCrmMessageInput,
    sentAt: Date,
  ): Prisma.TelegramCrmConversationUpdateInput {
    const update: Prisma.TelegramCrmConversationUpdateInput = {};
    if (!conversation.lastMessageAt || sentAt > conversation.lastMessageAt) {
      update.lastMessageAt = sentAt;
    }
    if (
      input.direction === TelegramCrmMessageDirection.INBOUND &&
      (!conversation.lastInboundAt || sentAt > conversation.lastInboundAt)
    ) {
      update.lastInboundAt = sentAt;
      update.unreadCount = {
        increment: input.unreadDelta ?? 1,
      };
    }
    if (
      input.direction === TelegramCrmMessageDirection.OUTBOUND &&
      (!conversation.lastOutboundAt || sentAt > conversation.lastOutboundAt)
    ) {
      update.lastOutboundAt = sentAt;
    }
    return update;
  }
}

import { crmChatRollout } from '../../../config/deployment-config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TelegramCrmMtprotoHandle } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';

export async function resolveManualReply(
  prisma: PrismaService,
  handle: TelegramCrmMtprotoHandle,
  conversation: { id: string; workspaceId: string; mtprotoAccountId: string },
  peer: { telegramUserId: string; telegramAccessHash: string },
  replyToMessageId?: string,
) {
  if (!replyToMessageId) return undefined;
  if (!crmChatRollout().actions)
    throw new BadRequestException('CHAT_REPLY_DISABLED');
  const original = await prisma.telegramCrmMessage.findFirst({
    where: {
      id: replyToMessageId,
      conversationId: conversation.id,
      workspaceId: conversation.workspaceId,
      mtprotoAccountId: conversation.mtprotoAccountId,
      deletedAt: null,
    },
    select: { telegramMessageIdNumeric: true },
  });
  if (!original?.telegramMessageIdNumeric)
    throw new NotFoundException('CHAT_REPLY_ORIGINAL_UNAVAILABLE');
  if (!handle.chatActions)
    throw new BadRequestException('CHAT_REPLY_UNAVAILABLE');
  const remote = await handle.chatActions.getMessage({
    ...peer,
    telegramMessageId: original.telegramMessageIdNumeric,
  });
  if (!remote || remote.telegramUserId !== peer.telegramUserId)
    throw new NotFoundException('CHAT_REPLY_ORIGINAL_UNAVAILABLE');
  return original.telegramMessageIdNumeric;
}

import { crmChatRollout } from '../../../config/deployment-config';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CrmChatActionResult } from '@telegram-system/shared';
import { TelegramCrmChatAccess } from './telegram-crm-chat-access.service';
import {
  TelegramCrmChatOperations,
  CRM_CHAT_MEDIA_LIMIT,
} from './telegram-crm-chat-operations.service';
import {
  TelegramCrmChatReceipts,
  chatOperationFingerprint,
  chatRandomId,
} from './telegram-crm-chat-receipts.service';
import { TelegramCrmChatStore } from './telegram-crm-chat-store.service';
import { CrmChatMediaDto } from './telegram-crm-chat.dto';

@Injectable()
export class TelegramCrmChatMedia {
  constructor(
    private readonly access: TelegramCrmChatAccess,
    private readonly operations: TelegramCrmChatOperations,
    private readonly receipts: TelegramCrmChatReceipts,
    private readonly store: TelegramCrmChatStore,
  ) {}
  async upload(
    userId: string,
    conversationId: string,
    input: CrmChatMediaDto,
    file?: Express.Multer.File,
  ): Promise<CrmChatActionResult> {
    if (!crmChatRollout().actions || !crmChatRollout().media)
      throw new ForbiddenException('CHAT_MEDIA_DISABLED');
    const { row } = await this.access.conversation(
      userId,
      conversationId,
      true,
      true,
    );
    if (!file?.buffer?.length || file.buffer.length > CRM_CHAT_MEDIA_LIMIT)
      throw new BadRequestException('CHAT_MEDIA_SIZE_INVALID');
    if (input.caption?.length && input.caption.length > 1024)
      throw new BadRequestException('CHAT_CAPTION_TOO_LONG');
    const request = {
      ...input,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
    };
    const claim = await this.receipts.claim({
      workspaceId: row.workspaceId,
      operationId: input.operationId,
      actorUserId: userId,
      conversationId,
      mtprotoAccountId: row.mtprotoAccountId,
      kind: 'MEDIA',
      targetMessageId: `media:${chatOperationFingerprint({ sha256: request.sha256, kind: input.kind, caption: input.caption ?? '', replyToMessageId: input.replyToMessageId ?? '' })}`,
      request,
      fingerprint: chatOperationFingerprint({
        userId,
        conversationId,
        request,
      }),
    });
    if (!claim.fresh) return this.receipts.response(claim.receipt);
    try {
      const result = await this.access.withHandle(
        userId,
        conversationId,
        true,
        true,
        async (handle, current, peer, memberId) => {
          if (!handle.chatActions)
            throw new BadRequestException('CHAT_MEDIA_UNAVAILABLE');
          let replyToTelegramMessageId: number | undefined;
          if (input.replyToMessageId) {
            const reply = await this.operations.source(
              current.workspaceId,
              conversationId,
              input.replyToMessageId,
            );
            if (
              reply.deletedAt ||
              !(await handle.chatActions.getMessage({
                ...peer,
                telegramMessageId: reply.telegramMessageIdNumeric!,
              }))
            )
              throw new NotFoundException('CHAT_REPLY_UNAVAILABLE');
            replyToTelegramMessageId = reply.telegramMessageIdNumeric!;
          }
          const sent = await handle.chatActions.sendMedia({
            ...peer,
            data: file.buffer,
            fileName: file.originalname,
            mimeType: file.mimetype,
            kind: input.kind,
            caption: input.caption,
            replyToTelegramMessageId,
            randomId: chatRandomId(
              current.mtprotoAccountId,
              conversationId,
              input.operationId,
            ),
          });
          return {
            operationId: input.operationId,
            status: 'CONFIRMED' as const,
            conversationId,
            message: await this.store.confirmed(current, sent, memberId, true),
          };
        },
      );
      await this.receipts.finish(claim.receipt, result);
      return result;
    } catch (error) {
      return this.operations.failed(claim.receipt, error);
    } finally {
      file.buffer = Buffer.alloc(0);
    }
  }
  async download(userId: string, conversationId: string, messageId: string) {
    if (!crmChatRollout().media)
      throw new ForbiddenException('CHAT_MEDIA_DISABLED');
    return this.access.withHandle(
      userId,
      conversationId,
      false,
      false,
      async (handle, row, peer) => {
        const message = await this.operations.source(
          row.workspaceId,
          conversationId,
          messageId,
        );
        if (message.deletedAt || !handle.chatActions)
          throw new NotFoundException('CHAT_MEDIA_UNAVAILABLE');
        return handle.chatActions.downloadMedia({
          ...peer,
          telegramMessageId: message.telegramMessageIdNumeric!,
          maxBytes: CRM_CHAT_MEDIA_LIMIT,
        });
      },
    );
  }
}

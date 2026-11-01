import { crmChatRollout } from '../../../config/deployment-config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CrmChatActionRequest,
  CrmChatActionResult,
  CrmChatCapabilities,
} from '@telegram-system/shared';
import type { TelegramCrmChatOperation } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeCrmOutgoingText } from '@api/telegram/shared/mtproto/telegram-crm-chat-text';
import { TelegramCrmChatAccess } from './telegram-crm-chat-access.service';
import { TelegramCrmChatStore } from './telegram-crm-chat-store.service';
import {
  chatOperationFingerprint,
  chatRandomId,
  TelegramCrmChatReceipts,
} from './telegram-crm-chat-receipts.service';
export const CRM_CHAT_MEDIA_LIMIT = 10 * 1024 * 1024;

@Injectable()
export class TelegramCrmChatOperations {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TelegramCrmChatAccess,
    private readonly receipts: TelegramCrmChatReceipts,
    private readonly store: TelegramCrmChatStore,
  ) {}
  async capabilities(
    userId: string,
    conversationId: string,
  ): Promise<CrmChatCapabilities> {
    const { row } = await this.access.conversation(userId, conversationId);
    let allowed = false;
    try {
      await this.access.conversation(userId, conversationId, true, true);
      allowed =
        row.mtprotoAccount.isActive &&
        row.mtprotoAccount.status === 'connected' &&
        row.mtprotoAccount.crmSendEnabled &&
        crmChatRollout().actions;
    } catch {
      /* Read-only users retain visible history. */
    }
    return {
      canReply: allowed,
      canEdit: allowed,
      canDelete: allowed,
      canDeleteForEveryone: allowed,
      canReact: allowed,
      canForward: allowed,
      canUpload: allowed && crmChatRollout().media,
      canSendVoice: allowed && crmChatRollout().media,
      maxUploadBytes: CRM_CHAT_MEDIA_LIMIT,
      voiceMimeTypes: ['audio/ogg;codecs=opus'],
      reactionEmoji: ['👍', '❤️', '🔥', '👏', '😁', '🤔', '👎'],
      ...(!allowed ? { reason: 'CHAT_SEND_UNAVAILABLE' } : {}),
    };
  }
  async execute(
    userId: string,
    conversationId: string,
    input: CrmChatActionRequest,
  ): Promise<CrmChatActionResult> {
    if (!crmChatRollout().actions)
      throw new ForbiddenException('CHAT_ACTIONS_DISABLED');
    const commercial = input.kind === 'EDIT' || input.kind === 'FORWARD';
    const { row } = await this.access.conversation(
      userId,
      conversationId,
      true,
      commercial,
    );
    const message = await this.source(
      row.workspaceId,
      conversationId,
      input.messageId,
    );
    if (input.kind === 'EDIT' && !input.text?.trim())
      throw new BadRequestException('CHAT_TEXT_REQUIRED');
    const destination =
      input.kind === 'FORWARD'
        ? await this.access.conversation(
            userId,
            input.destinationConversationId ?? '',
            true,
            true,
          )
        : null;
    if (
      destination &&
      destination.row.mtprotoAccountId !== row.mtprotoAccountId
    )
      throw new BadRequestException('CHAT_FORWARD_ACCOUNT_MISMATCH');
    const claim = await this.receipts.claim({
      workspaceId: row.workspaceId,
      actorUserId: userId,
      operationId: input.operationId,
      conversationId,
      mtprotoAccountId: row.mtprotoAccountId,
      targetMessageId: message.id,
      kind: input.kind,
      request: { ...input },
      fingerprint: chatOperationFingerprint({ userId, conversationId, input }),
    });
    if (!claim.fresh) return this.receipts.response(claim.receipt);
    try {
      const result = await this.access.withHandle(
        userId,
        conversationId,
        true,
        commercial,
        async (handle, current, peer, memberId) => {
          const api = handle.chatActions;
          if (!api) throw new ConflictException('CHAT_ACTIONS_UNAVAILABLE');
          const remote = await api.getMessage({
            ...peer,
            telegramMessageId: message.telegramMessageIdNumeric!,
          });
          if (!remote && input.kind !== 'DELETE')
            throw new NotFoundException('CHAT_MESSAGE_UNAVAILABLE');
          if (input.kind === 'DELETE') {
            if (!remote && input.revoke)
              throw new ConflictException(
                'CHAT_DELETE_EVERYONE_OUTCOME_UNVERIFIABLE',
              );
            if (remote)
              await api.deleteMessages({
                ...peer,
                telegramMessageIds: [message.telegramMessageIdNumeric!],
                revoke: input.revoke === true,
              });
            const readState = api.getReadState
              ? await api.getReadState(peer).catch(() => {
                  throw new Error('CHAT_DELETE_READ_SNAPSHOT_UNKNOWN');
                })
              : undefined;
            const deletedMessageIds = await this.store.deleted(
              current,
              [message.telegramMessageIdNumeric!],
              readState,
            );
            return {
              operationId: input.operationId,
              status: 'CONFIRMED' as const,
              conversationId,
              deletedMessageIds,
            };
          }
          if (input.kind === 'EDIT') {
            if (remote!.direction !== 'OUTBOUND')
              throw new ForbiddenException('CHAT_EDIT_OWN_ONLY');
            // Editing an AI-attributed message changes approved provenance: require an ordinary new message instead.
            if (
              (message.contentMetadata as { aiDraftId?: string } | null)
                ?.aiDraftId
            )
              throw new ConflictException(
                'CHAT_APPROVED_AI_EDIT_REQUIRES_REVIEW',
              );
            const changed = await api.editText({
              ...peer,
              telegramMessageId: message.telegramMessageIdNumeric!,
              text: input.text!,
            });
            return {
              operationId: input.operationId,
              status: 'CONFIRMED' as const,
              conversationId,
              message: await this.store.confirmed(current, changed, memberId),
            };
          }
          if (input.kind === 'REACTION') {
            const changed = await api.setReaction({
              ...peer,
              telegramMessageId: message.telegramMessageIdNumeric!,
              emoji: input.emoji ?? null,
            });
            return {
              operationId: input.operationId,
              status: 'CONFIRMED' as const,
              conversationId,
              message: await this.store.confirmed(current, changed, memberId),
            };
          }
          if (
            (message.contentMetadata as { aiDraftId?: string } | null)
              ?.aiDraftId
          )
            throw new ConflictException(
              'CHAT_APPROVED_AI_FORWARD_REQUIRES_NEW_APPROVAL',
            );
          if (remote!.contentMetadata?.protectedContent)
            throw new ForbiddenException('CHAT_CONTENT_PROTECTED');
          const target = await this.access.conversation(
            userId,
            destination!.row.id,
            true,
            true,
          );
          if (target.row.mtprotoAccountId !== current.mtprotoAccountId)
            throw new BadRequestException('CHAT_FORWARD_ACCOUNT_MISMATCH');
          const targetPeer = target.row.telegramAccessHash
            ? {
                telegramUserId: target.row.peer.telegramUserId,
                telegramAccessHash: target.row.telegramAccessHash,
              }
            : await handle.resolvePrivatePeer({
                telegramUserId: target.row.peer.telegramUserId,
                username: target.row.peer.username,
              });
          const sent = await api.forwardMessage({
            origin: peer,
            destination: targetPeer,
            telegramMessageId: message.telegramMessageIdNumeric!,
            randomId: chatRandomId(
              current.mtprotoAccountId,
              target.row.id,
              input.operationId,
            ),
          });
          return {
            operationId: input.operationId,
            status: 'CONFIRMED' as const,
            conversationId: target.row.id,
            message: await this.store.confirmed(
              target.row,
              sent,
              memberId,
              true,
            ),
          };
        },
      );
      await this.receipts.finish(claim.receipt, result);
      return result;
    } catch (error) {
      return this.failed(claim.receipt, error);
    }
  }
  async status(
    userId: string,
    conversationId: string,
    operationId: string,
  ): Promise<CrmChatActionResult> {
    const { row } = await this.access.conversation(
      userId,
      conversationId,
      true,
    );
    const receipt = await this.receipts.find(row.workspaceId, operationId);
    if (
      !receipt ||
      receipt.conversationId !== conversationId ||
      receipt.actorUserId !== userId
    )
      throw new NotFoundException('CHAT_OPERATION_NOT_FOUND');
    const request = receipt.request as CrmChatActionRequest;
    if (request.destinationConversationId)
      await this.access.conversation(
        userId,
        request.destinationConversationId,
        true,
      );
    if (
      receipt.status !== 'UNKNOWN' ||
      !['EDIT', 'REACTION', 'DELETE'].includes(receipt.kind)
    )
      return this.receipts.response(receipt);
    // Read-only reconciliation: this endpoint never repeats the Telegram mutation.
    const message = await this.source(
      row.workspaceId,
      conversationId,
      request.messageId,
    );
    return this.access.withHandle(
      userId,
      conversationId,
      false,
      false,
      async (handle, current, peer, memberId) => {
        if (!handle.chatActions) return this.receipts.response(receipt);
        const remote = await handle.chatActions.getMessage({
          ...peer,
          telegramMessageId: message.telegramMessageIdNumeric!,
        });
        let result: CrmChatActionResult | null = null;
        if (receipt.kind === 'DELETE' && !remote && !request.revoke) {
          const readState = handle.chatActions.getReadState
            ? await handle.chatActions.getReadState(peer)
            : undefined;
          result = {
            operationId,
            status: 'CONFIRMED',
            conversationId,
            deletedMessageIds: await this.store.deleted(
              current,
              [message.telegramMessageIdNumeric!],
              readState,
            ),
          };
        }
        if (receipt.kind === 'EDIT' && remote) {
          const expected = normalizeCrmOutgoingText(request.text!);
          if (
            remote.text === expected.text &&
            JSON.stringify(remote.contentMetadata?.entities ?? []) ===
              JSON.stringify(expected.entities)
          )
            result = {
              operationId,
              status: 'CONFIRMED',
              conversationId,
              message: await this.store.confirmed(current, remote, memberId),
            };
        }
        if (receipt.kind === 'REACTION' && remote) {
          const reactions = (remote.contentMetadata?.reactions ?? []) as Array<{
            emoji: string;
            chosen?: boolean;
          }>;
          if (
            request.emoji
              ? reactions.some((r) => r.chosen && r.emoji === request.emoji)
              : !reactions.some((r) => r.chosen)
          )
            result = {
              operationId,
              status: 'CONFIRMED',
              conversationId,
              message: await this.store.confirmed(current, remote, memberId),
            };
        }
        if (!result) return this.receipts.response(receipt);
        await this.receipts.finish(receipt, result);
        return result;
      },
    );
  }
  async source(workspaceId: string, conversationId: string, id: string) {
    const row = await this.prisma.telegramCrmMessage.findFirst({
      where: { id, workspaceId, conversationId },
      select: {
        id: true,
        telegramMessageIdNumeric: true,
        direction: true,
        deletedAt: true,
        contentMetadata: true,
      },
    });
    if (!row?.telegramMessageIdNumeric)
      throw new NotFoundException('CHAT_MESSAGE_NOT_FOUND');
    return row;
  }
  async failed(
    receipt: TelegramCrmChatOperation,
    error: unknown,
  ): Promise<CrmChatActionResult> {
    const definitive =
      error instanceof BadRequestException ||
      error instanceof ForbiddenException ||
      error instanceof NotFoundException ||
      error instanceof ConflictException ||
      (typeof (error as { code?: unknown })?.code === 'number' &&
        Number((error as { code: number }).code) >= 400 &&
        Number((error as { code: number }).code) < 500);
    const result: CrmChatActionResult = {
      operationId: receipt.operationId,
      status: definitive ? 'FAILED' : 'UNKNOWN',
      conversationId: receipt.conversationId,
      errorCode: definitive
        ? 'CHAT_OPERATION_REJECTED'
        : 'CHAT_OPERATION_OUTCOME_UNKNOWN',
    };
    try {
      await this.receipts.finish(receipt, result);
    } catch {
      /* Durable initial UNKNOWN claim prevents duplicate execution after a DB failure. */
    }
    return result;
  }
}

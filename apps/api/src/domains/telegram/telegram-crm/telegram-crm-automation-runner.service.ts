import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { sanitizeOperationalError } from '../../../common/security/operational-error';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  type CrmAutomationAuthorizationResult,
  TelegramCrmAutomationAuthorizationService,
} from './telegram-crm-automation-authorization.service';
import { TelegramCrmAutomationClaimService } from './telegram-crm-automation-claim.service';
import { TelegramCrmAutomationConversationService } from './telegram-crm-automation-conversation.service';
import {
  CrmAutomationExecutionRow as ExecutionRow,
  crmAutomationExecutionSelect as executionSelect,
} from './telegram-crm-automation-execution';
import { TelegramCrmAutomationFinalizerService } from './telegram-crm-automation-finalizer.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { mapCrmMessage } from './telegram-crm-message.mapper';

const BASE_RETRY_MS = 30_000;
const MAX_BATCH = 1_000;

@Injectable()
export class TelegramCrmAutomationRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TelegramCrmAutomationAuthorizationService,
    private readonly claims: TelegramCrmAutomationClaimService,
    private readonly conversations: TelegramCrmAutomationConversationService,
    private readonly finalizer: TelegramCrmAutomationFinalizerService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async processDueBatch(limit = MAX_BATCH) {
    const bounded = Math.max(1, Math.min(MAX_BATCH, limit));
    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let retried = 0;
    let failed = 0;
    await this.claims.terminalizeExhausted(bounded);
    while (processed < bounded) {
      const ids = await this.claims.claim(Math.min(25, bounded - processed));
      if (!ids.length) break;
      for (const id of ids) {
        const result = await this.processClaim(id);
        processed += 1;
        if (result === 'SENT') sent += 1;
        else if (result === 'SKIPPED') skipped += 1;
        else if (result === 'RETRY') retried += 1;
        else failed += 1;
      }
    }
    return { processed, sent, skipped, retried, failed };
  }

  private async processClaim(
    id: string,
  ): Promise<'SENT' | 'SKIPPED' | 'RETRY' | 'FAILED'> {
    const execution =
      await this.prisma.telegramCrmCustomerAutomationExecution.findFirst({
        where: { id, leaseOwner: this.claims.ownerId, status: 'PROCESSING' },
        select: executionSelect,
      });
    if (!execution || !execution.sale || !execution.telegramAdSaleId) {
      await this.skip(id, 'DEAL_NOT_ELIGIBLE');
      return 'SKIPPED';
    }
    const ambiguousRecovery = execution.reason === 'AMBIGUOUS_SEND_RECOVERY';
    if (!ambiguousRecovery) {
      const sourceEligibility = this.authorization.preflight(execution);
      if (!sourceEligibility.allowed) {
        await this.skip(execution.id, sourceEligibility.reason);
        return 'SKIPPED';
      }
      if (!this.authorization.sourceStillCurrent(execution)) {
        await this.skip(execution.id, 'SOURCE_FACT_CHANGED');
        return 'SKIPPED';
      }
    }
    const target = await this.conversations.resolve({
      workspaceId: execution.workspaceId,
      contactId: execution.contactId,
      dealId: execution.telegramAdSaleId,
      pinnedConversationId: execution.conversationId,
      pinnedAccountId: execution.mtprotoAccountId,
    });
    if (!target) {
      if (ambiguousRecovery) {
        await this.failAmbiguous(execution.id, 'INVALID_CONVERSATION');
        return 'FAILED';
      }
      return this.retryOrFail(execution, 'INVALID_CONVERSATION');
    }
    if (!execution.conversationId) {
      const stableRandomId = this.randomId(
        target.mtprotoAccountId,
        target.conversationId,
        execution.eventKey,
      );
      const pinned =
        await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
          where: {
            id: execution.id,
            leaseOwner: this.claims.ownerId,
            status: 'PROCESSING',
            conversationId: null,
            mtprotoAccountId: null,
          },
          data: {
            conversationId: target.conversationId,
            mtprotoAccountId: target.mtprotoAccountId,
            stableRandomId,
          },
        });
      if (pinned.count !== 1) return 'FAILED';
      execution.conversationId = target.conversationId;
      execution.mtprotoAccountId = target.mtprotoAccountId;
      execution.stableRandomId = stableRandomId;
    } else if (!execution.stableRandomId) {
      const stableRandomId = this.randomId(
        target.mtprotoAccountId,
        target.conversationId,
        execution.eventKey,
      );
      await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
        where: {
          id: execution.id,
          leaseOwner: this.claims.ownerId,
          status: 'PROCESSING',
          stableRandomId: null,
        },
        data: { stableRandomId },
      });
      execution.stableRandomId = stableRandomId;
    }
    let authorized: CrmAutomationAuthorizationResult;
    try {
      authorized = await this.authorization.authorize(
        execution,
        this.claims.ownerId,
        target,
      );
    } catch (error) {
      return this.retryOrFail(
        execution,
        `AUTHORIZATION_COMMIT_FAILED: ${sanitizeOperationalError(error)}`,
        false,
        ambiguousRecovery,
      );
    }
    if (authorized.kind === 'LOST') return 'FAILED';
    if (authorized.kind === 'DENIED') {
      if (ambiguousRecovery) {
        await this.failAmbiguous(execution.id, authorized.reason);
        return 'FAILED';
      }
      if (
        authorized.reason === 'INVALID_CONVERSATION' ||
        authorized.reason === 'ACCOUNT_DISABLED'
      ) {
        return this.retryOrFail(
          authorized.execution ?? execution,
          authorized.reason,
        );
      }
      await this.skip(execution.id, authorized.reason);
      return 'SKIPPED';
    }
    const sendingExecution = authorized.execution;
    try {
      const sent = await this.runtime.withAccountHandle(
        sendingExecution.workspaceId,
        target.mtprotoAccountId,
        'send',
        async (handle) => {
          const peer = target.telegramAccessHash
            ? {
                telegramUserId: target.telegramUserId,
                telegramAccessHash: target.telegramAccessHash,
              }
            : await handle.resolvePrivatePeer({
                telegramUserId: target.telegramUserId,
                username: target.username,
              });
          if (!target.telegramAccessHash) {
            await this.prisma.telegramCrmConversation.updateMany({
              where: {
                id: target.conversationId,
                workspaceId: sendingExecution.workspaceId,
                mtprotoAccountId: target.mtprotoAccountId,
                telegramAccessHash: null,
              },
              data: { telegramAccessHash: peer.telegramAccessHash },
            });
          }
          return handle.sendText({
            telegramUserId: peer.telegramUserId,
            telegramAccessHash: peer.telegramAccessHash,
            text: sendingExecution.renderedText!,
            randomId: BigInt(sendingExecution.stableRandomId!),
          });
        },
      );
      const message = await this.finalizer.finalize(
        sendingExecution,
        this.claims.ownerId,
        target.conversationId,
        target.mtprotoAccountId,
        sent,
      );
      const occurredAt = new Date().toISOString();
      this.events.emit({
        type: 'message.sent',
        workspaceId: sendingExecution.workspaceId,
        occurredAt,
        conversationId: target.conversationId,
        contactId: sendingExecution.contactId,
        ownerMemberId: sendingExecution.contact.ownerMemberId,
        message: { ...mapCrmMessage(message), sentByMember: null },
      });
      this.events.emit({
        type: 'contact.updated',
        workspaceId: sendingExecution.workspaceId,
        occurredAt,
        contactId: sendingExecution.contactId,
        ownerMemberId: sendingExecution.contact.ownerMemberId,
      });
      return 'SENT';
    } catch (error) {
      return this.retryOrFail(
        sendingExecution,
        sanitizeOperationalError(error),
        true,
      );
    }
  }

  private async skip(id: string, reason: string) {
    await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
      where: {
        id,
        leaseOwner: this.claims.ownerId,
        status: { in: ['PROCESSING', 'SENDING'] },
      },
      data: {
        status: 'SKIPPED',
        completedAt: new Date(),
        reason,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  private async failAmbiguous(id: string, reason: string) {
    await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
      where: {
        id,
        leaseOwner: this.claims.ownerId,
        status: 'PROCESSING',
      },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        reason: 'AMBIGUOUS_SEND_UNRESOLVED',
        lastError: `Current safety gate rejected recovery: ${reason}`,
        nextAttemptAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  private async retryOrFail(
    execution: Pick<ExecutionRow, 'id' | 'attempts' | 'maxAttempts'>,
    error: string,
    fromSending = false,
    ambiguousProcessing = false,
  ): Promise<'RETRY' | 'FAILED'> {
    const terminal = execution.attempts >= execution.maxAttempts;
    const ambiguous = fromSending || ambiguousProcessing;
    const delay = BASE_RETRY_MS * 2 ** Math.max(0, execution.attempts - 1);
    const retryAt = new Date(Date.now() + delay);
    await this.prisma.telegramCrmCustomerAutomationExecution.updateMany({
      where: {
        id: execution.id,
        leaseOwner: this.claims.ownerId,
        status: fromSending ? 'SENDING' : 'PROCESSING',
      },
      data: {
        status: terminal
          ? 'FAILED'
          : fromSending || ambiguousProcessing
            ? 'SENDING'
            : 'PENDING',
        completedAt: terminal ? new Date() : null,
        nextAttemptAt:
          terminal || fromSending || ambiguousProcessing ? null : retryAt,
        lastError:
          terminal && ambiguous
            ? `Telegram send outcome remains ambiguous: ${error}`
            : error,
        reason: terminal
          ? ambiguous
            ? 'AMBIGUOUS_SEND_UNRESOLVED'
            : 'RETRY_EXHAUSTED'
          : ambiguous
            ? 'AMBIGUOUS_SEND_RECOVERY'
            : 'RECOVERABLE_FAILURE',
        leaseOwner: null,
        leaseExpiresAt:
          terminal || (!fromSending && !ambiguousProcessing) ? null : retryAt,
      },
    });
    return terminal ? 'FAILED' : 'RETRY';
  }

  private randomId(
    accountId: string,
    conversationId: string,
    eventKey: string,
  ) {
    return createHash('sha256')
      .update(`${accountId}\0${conversationId}\0${eventKey}`)
      .digest()
      .readBigInt64BE(0)
      .toString();
  }
}

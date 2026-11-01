import { ConflictException, Injectable } from '@nestjs/common';
import type { CrmCopilotSendApproval } from '@telegram-system/shared';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TelegramCrmCopilotContextService,
  copilotHash,
} from './telegram-crm-copilot-context.service';
import {
  TelegramCrmCopilotDraftsService,
  type CopilotSnapshot,
} from './telegram-crm-copilot-drafts.service';
import {
  assertCopilotEligibility,
  copilotTextWarnings,
} from './telegram-crm-copilot-policy';

@Injectable()
export class TelegramCrmCopilotSendGuard {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: TelegramCrmCopilotDraftsService,
    private readonly context: TelegramCrmCopilotContextService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}
  async assertCanSend(
    userId: string,
    conversationId: string,
    text: string,
    approval: CrmCopilotSendApproval,
  ) {
    await this.context.refreshAccess(userId);
    await this.authorization.require(userId, 'adSales.crm.sendManualMessages');
    const draft = await this.drafts.own(
      userId,
      conversationId,
      approval.aiDraftId,
    );
    if (
      draft.status !== 'APPROVED' ||
      draft.expiresAt <= new Date() ||
      draft.revision !== approval.aiDraftRevision ||
      draft.approvedTextHash !== copilotHash(text.trim())
    )
      throw new ConflictException('COPILOT_APPROVAL_REQUIRED');
    const input = draft.requestSnapshot as unknown as CopilotSnapshot;
    const current = await this.context.build(userId, conversationId, input);
    assertCopilotEligibility(current, input);
    if (
      current.contactId !== draft.contactId ||
      current.contextVersion !== draft.contextVersion ||
      copilotTextWarnings(text, current).length
    )
      throw new ConflictException('COPILOT_CONTEXT_STALE');
  }
  async markSent(
    userId: string,
    conversationId: string,
    approval: CrmCopilotSendApproval,
    messageId: string,
    verifiedReceiptWorkspaceId?: string,
  ) {
    if (verifiedReceiptWorkspaceId) {
      // Only the manual sender supplies this after verifying or persisting its scoped receipt.
      await this.prisma.telegramCrmAiDraft.updateMany({
        where: {
          id: approval.aiDraftId,
          workspaceId: verifiedReceiptWorkspaceId,
          conversationId,
          authorUserId: userId,
          revision: approval.aiDraftRevision,
          status: 'APPROVED',
        },
        data: { status: 'SENT', sentMessageId: messageId },
      });
      return;
    }
    const draft = await this.drafts.own(
      userId,
      conversationId,
      approval.aiDraftId,
    );
    if (draft.status === 'SENT' && draft.sentMessageId === messageId) return;
    await this.prisma.telegramCrmAiDraft.updateMany({
      where: {
        id: draft.id,
        workspaceId: draft.workspaceId,
        authorUserId: userId,
        revision: approval.aiDraftRevision,
        status: 'APPROVED',
      },
      data: { status: 'SENT', sentMessageId: messageId },
    });
  }
}

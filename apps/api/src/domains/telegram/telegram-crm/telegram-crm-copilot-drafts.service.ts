import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type TelegramCrmAiDraft } from '@prisma/client';
import type {
  CrmCopilotDraft,
  CrmCopilotOutput,
  CrmCopilotFact,
  CrmCopilotGenerateInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapAiOperationView } from '../../operations/ai/ai-operation-presentation';
import { TelegramCrmCopilotContextService } from './telegram-crm-copilot-context.service';

export type CopilotSnapshot = CrmCopilotGenerateInput & {
  identityVersion: string;
};
@Injectable()
export class TelegramCrmCopilotDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TelegramCrmCopilotContextService,
  ) {}
  async own(userId: string, conversationId: string, id: string) {
    const access = await this.context.access(userId, conversationId);
    const draft = await this.prisma.telegramCrmAiDraft.findFirst({
      where: { id, workspaceId: access.workspaceId, conversationId },
    });
    if (!draft) throw new NotFoundException('COPILOT_DRAFT_NOT_FOUND');
    if (draft.authorUserId !== userId)
      throw new ForbiddenException('COPILOT_DRAFT_OWNER_REQUIRED');
    return draft;
  }
  async replay(
    workspaceId: string,
    userId: string,
    conversationId: string,
    operationId: string,
    fingerprint: string,
  ) {
    const draft = await this.prisma.telegramCrmAiDraft.findUnique({
      where: { workspaceId_operationId: { workspaceId, operationId } },
    });
    if (!draft) return null;
    if (
      draft.authorUserId !== userId ||
      draft.conversationId !== conversationId
    )
      throw new ForbiddenException('COPILOT_DRAFT_OWNER_REQUIRED');
    if (draft.requestFingerprint !== fingerprint)
      throw new ConflictException('COPILOT_OPERATION_CONFLICT');
    return draft;
  }
  async list(userId: string, conversationId: string) {
    const access = await this.context.access(userId, conversationId);
    const drafts = await this.prisma.telegramCrmAiDraft.findMany({
      where: {
        workspaceId: access.workspaceId,
        conversationId,
        authorUserId: userId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });
    if (!drafts.length) return { items: [] };
    const operationIds = drafts.flatMap((draft) =>
      draft.operationDbId ? [draft.operationDbId] : [],
    );
    const operations = operationIds.length
      ? await this.prisma.aiOperation.findMany({
          where: {
            workspaceId: access.workspaceId,
            id: {
              in: operationIds,
            },
          },
        })
      : [];
    const latest = drafts.find(
      (draft) =>
        ['READY', 'APPROVED', 'REVIEW_REQUIRED'].includes(draft.status) &&
        draft.expiresAt > new Date(),
    );
    let latestIsFresh = false;
    if (latest) {
      const current = await this.context.build(
        userId,
        conversationId,
        latest.requestSnapshot as unknown as CopilotSnapshot,
      );
      latestIsFresh =
        current.canGenerate && current.contextVersion === latest.contextVersion;
    }
    return {
      items: drafts.map((draft) =>
        this.present(
          ['READY', 'APPROVED', 'REVIEW_REQUIRED'].includes(draft.status)
            ? {
                ...draft,
                status:
                  draft.id === latest?.id
                    ? latestIsFresh
                      ? draft.status
                      : 'STALE'
                    : 'REVIEW_REQUIRED',
              }
            : draft,
          operations.find((operation) => operation.id === draft.operationDbId),
        ),
      ),
    };
  }
  async view(draft: TelegramCrmAiDraft) {
    const operation = draft.operationDbId
      ? await this.prisma.aiOperation.findFirst({
          where: { id: draft.operationDbId, workspaceId: draft.workspaceId },
        })
      : null;
    return this.present(draft, operation);
  }
  private present(
    draft: TelegramCrmAiDraft,
    operation?: Parameters<typeof mapAiOperationView>[0] | null,
  ): CrmCopilotDraft {
    const expired = draft.expiresAt <= new Date();
    return {
      id: draft.id,
      workspaceId: draft.workspaceId,
      conversationId: draft.conversationId,
      contactId: draft.contactId,
      authorUserId: draft.authorUserId,
      operationId: draft.operationId,
      category: draft.category as CrmCopilotDraft['category'],
      tone: draft.tone as CrmCopilotDraft['tone'],
      status: expired
        ? 'EXPIRED'
        : draft.status === 'GENERATING' &&
            Date.now() - draft.createdAt.getTime() > 120000
          ? 'UNKNOWN'
          : (draft.status as CrmCopilotDraft['status']),
      text: draft.text,
      output: draft.output as unknown as CrmCopilotOutput | null,
      facts: draft.facts as unknown as CrmCopilotFact[],
      missingFacts: draft.missingFacts as unknown as string[],
      warnings: draft.warnings as unknown as string[],
      contextVersion: draft.contextVersion,
      revision: draft.revision,
      createdAt: draft.createdAt.toISOString(),
      expiresAt: draft.expiresAt.toISOString(),
      approvedAt: draft.approvedAt?.toISOString() ?? null,
      operation: operation ? mapAiOperationView(operation) : null,
      canEdit:
        !expired &&
        ['READY', 'REVIEW_REQUIRED', 'APPROVED', 'STALE'].includes(
          draft.status,
        ),
    };
  }
}

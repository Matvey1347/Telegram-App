import { Injectable } from '@nestjs/common';
import type {
  TelegramLeadQualification,
  TelegramLeadCandidateDraft,
} from '@prisma/client';
import type {
  LeadCandidateDraftView,
  LeadPreparationView,
  LeadQualificationOutput,
  LeadQualificationScore,
  LeadQualificationView,
  CrmCopilotOutput,
} from '@telegram-system/shared';
import {
  mapAiOperationView,
  aiOperationPresentationSelect,
} from '../../../operations/ai/ai-operation-presentation';
import {
  TelegramLeadPreparationContext,
  type LeadPreparationContext,
} from './lead-preparation-context.service';
import {
  leadPreparationWorkflow,
  leadHumanQualificationFresh,
  leadDraftApprovalHash,
} from './lead-preparation-state';
export const preparationProductIds = (snapshot: unknown): string[] => {
  const value = snapshot as { productIds?: unknown };
  return Array.isArray(value?.productIds)
    ? value.productIds
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 5)
    : [];
};
@Injectable()
export class TelegramLeadPreparationReadService {
  constructor(readonly context: TelegramLeadPreparationContext) {}
  async view(
    userId: string,
    candidateId: string,
  ): Promise<LeadPreparationView> {
    const access = await this.context.policy.access(userId);
    const qualification =
      await this.context.prisma.telegramLeadQualification.findFirst({
        where: { workspaceId: access.workspaceId, candidateId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    const context = await this.context.build(
      userId,
      candidateId,
      preparationProductIds(qualification?.requestSnapshot),
    );
    const drafts =
      await this.context.prisma.telegramLeadCandidateDraft.findMany({
        where: {
          workspaceId: context.workspaceId,
          candidateId,
          authorUserId: userId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      });
    const operationIds = [
      ...drafts.map((row) => row.operationId),
      ...(qualification ? [qualification.operationId] : []),
    ];
    const operations = operationIds.length
      ? await this.context.prisma.aiOperation.findMany({
          where: {
            workspaceId: context.workspaceId,
            operationId: { in: operationIds },
          },
          select: aiOperationPresentationSelect,
        })
      : [];
    const operation = (id: string) => {
      const row = operations.find((row) => row.operationId === id);
      return row ? mapAiOperationView(row) : null;
    };
    const qual = qualification
      ? this.qualification(
          qualification,
          context,
          operation(qualification.operationId),
        )
      : null;
    const capabilities = await this.context.policy.configuration(userId);
    const allowedReview = capabilities.canReview;
    const draftViews = drafts.map((draft) =>
      this.draft(
        draft,
        context,
        operation(draft.operationId),
        qualification,
        allowedReview,
      ),
    );
    return {
      candidateId,
      workflowState: leadPreparationWorkflow(context.candidate, qual),
      enabled: this.context.enabled(),
      policy: context.policy,
      blockedReason: context.blockedReason,
      canQualify: context.canGenerate && capabilities.canAnalyze,
      canGenerateDraft:
        capabilities.canAnalyze &&
        context.canGenerate &&
        qual?.status === 'READY' &&
        leadHumanQualificationFresh(context.candidate, qualification),
      canReview: allowedReview,
      qualification: qual,
      drafts: draftViews,
      products: context.products,
      riskAcknowledgedAt:
        context.candidate.riskAcknowledgedAt?.toISOString() ?? null,
      qualificationDecision: context.candidate.qualificationDecision,
    };
  }
  qualification(
    row: TelegramLeadQualification,
    context: LeadPreparationContext,
    operation: LeadQualificationView['operation'],
  ): LeadQualificationView {
    let status = row.status as LeadQualificationView['status'];
    if (row.expiresAt <= new Date()) status = 'EXPIRED';
    else if (
      row.status === 'GENERATING' &&
      Date.now() - row.createdAt.getTime() > 120000
    )
      status = 'UNKNOWN';
    else if (
      row.status === 'READY' &&
      (row.contextVersion !== context.contextVersion || context.blockedReason)
    )
      status = 'STALE';
    return {
      id: row.id,
      candidateId: row.candidateId,
      operationId: row.operationId,
      status,
      contextVersion: row.contextVersion,
      policyVersion: row.policyVersion,
      output: row.output as unknown as LeadQualificationOutput | null,
      score: row.score as unknown as LeadQualificationScore | null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      operation,
    };
  }
  draft(
    row: TelegramLeadCandidateDraft,
    context: LeadPreparationContext,
    operation: LeadCandidateDraftView['operation'],
    qualification: TelegramLeadQualification | null = null,
    canReview = true,
  ): LeadCandidateDraftView {
    let status = row.status as LeadCandidateDraftView['status'];
    if (row.expiresAt <= new Date()) status = 'EXPIRED';
    else if (
      row.status === 'GENERATING' &&
      Date.now() - row.createdAt.getTime() > 120000
    )
      status = 'UNKNOWN';
    else if (
      ['READY', 'REVIEW_REQUIRED', 'APPROVED'].includes(row.status) &&
      (row.contextVersion !== context.contextVersion || context.blockedReason)
    )
      status = 'STALE';
    const humanFresh =
      qualification?.status === 'READY' &&
      qualification.expiresAt > new Date() &&
      qualification.contextVersion === context.contextVersion &&
      leadHumanQualificationFresh(context.candidate, qualification);
    if (
      status === 'APPROVED' &&
      (!humanFresh ||
        row.approvalHash !==
          leadDraftApprovalHash(
            row.text,
            row.revision,
            row.contextVersion,
            context.candidate,
            qualification.id,
          ))
    )
      status = 'REVIEW_REQUIRED';
    return {
      id: row.id,
      candidateId: row.candidateId,
      authorUserId: row.authorUserId,
      operationId: row.operationId,
      category: 'SALES_FIRST_DRAFT',
      status,
      text: row.text,
      tone: row.tone as LeadCandidateDraftView['tone'],
      language: row.language as LeadCandidateDraftView['language'],
      output: row.output as unknown as CrmCopilotOutput | null,
      warnings: row.warnings as string[],
      evidenceIds: Array.isArray(row.evidenceRefs)
        ? row.evidenceRefs.filter((id): id is string => typeof id === 'string')
        : [],
      contextVersion: row.contextVersion,
      revision: row.revision,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      operation,
      canEdit:
        canReview &&
        ['READY', 'REVIEW_REQUIRED', 'APPROVED', 'STALE'].includes(status),
      canCopy:
        canReview &&
        status === 'APPROVED' &&
        context.canGenerate &&
        Boolean(humanFresh),
    };
  }
}

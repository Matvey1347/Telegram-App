import { leadPreparationFailure } from './lead-preparation-failure';
import {
  leadHumanQualificationFresh,
  leadDraftApprovalHash,
} from './lead-preparation-state';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  LeadCandidateDraftInput,
  LeadCandidateDraftPatch,
} from '@telegram-system/shared';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { AiGateway } from '../../../operations/ai/ai-gateway';
import {
  COPILOT_INSTRUCTIONS,
  copilotTextWarnings,
  validateCopilotOutput,
} from '../telegram-crm-copilot-policy';
import { copilotHash } from '../telegram-crm-copilot-context.service';
import {
  TelegramLeadPreparationContext,
  type LeadPreparationContext,
} from './lead-preparation-context.service';
import {
  TelegramLeadPreparationReadService,
  preparationProductIds,
} from './lead-preparation-read.service';
import { assertPreparationOperation } from './lead-qualification.service';
export const LEAD_FIRST_OFFER_VERSION = 'lead-first-offer-v1';
@Injectable()
export class TelegramLeadCandidateDraftService {
  constructor(
    private readonly context: TelegramLeadPreparationContext,
    private readonly read: TelegramLeadPreparationReadService,
    private readonly gateway: AiGateway,
  ) {}
  private async approvedQualification(current: LeadPreparationContext) {
    if (
      current.candidate.reviewStatus !== 'APPROVED' ||
      current.candidate.qualificationDecision !== 'QUALIFIED' ||
      current.candidate.qualificationContextVersion !== current.contextVersion
    )
      throw new ConflictException('LEAD_HUMAN_QUALIFICATION_REQUIRED');
    const qualification =
      await this.context.prisma.telegramLeadQualification.findFirst({
        where: {
          candidateId: current.candidate.id,
          workspaceId: current.workspaceId,
          contextVersion: current.contextVersion,
          status: 'READY',
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });
    if (!qualification)
      throw new ConflictException('LEAD_CURRENT_QUALIFICATION_REQUIRED');
    if (!leadHumanQualificationFresh(current.candidate, qualification))
      throw new ConflictException('LEAD_FRESH_HUMAN_QUALIFICATION_REQUIRED');
    return qualification;
  }
  async generate(
    userId: string,
    candidateId: string,
    input: LeadCandidateDraftInput,
  ) {
    assertPreparationOperation(input.operationId);
    const current = await this.context.build(
      userId,
      candidateId,
      input.productIds,
      true,
    );
    this.context.assert(current);
    const qualification = await this.approvedQualification(current);
    const language = input.language === 'AUTO' ? 'uk' : input.language;
    const fingerprint = copilotHash({
      version: LEAD_FIRST_OFFER_VERSION,
      candidateId,
      author: userId,
      contextVersion: current.contextVersion,
      productIds: [...input.productIds].sort(),
      tone: input.tone,
      language,
    });
    const businessObjectId = `lead-candidate-draft:${fingerprint}`;
    const claimed = await this.context.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `lead-preparation:${current.workspaceId}`,
      );
      const existing = await tx.telegramLeadCandidateDraft.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: current.workspaceId,
            operationId: input.operationId,
          },
        },
      });
      if (existing) {
        if (
          existing.authorUserId !== userId ||
          existing.candidateId !== candidateId
        )
          throw new ForbiddenException('LEAD_DRAFT_OWNER_REQUIRED');
        if (existing.requestFingerprint !== fingerprint)
          throw new ConflictException('LEAD_OPERATION_CONTEXT_CONFLICT');
        return { row: existing, created: false };
      }
      const cached = await tx.telegramLeadCandidateDraft.findFirst({
        where: {
          workspaceId: current.workspaceId,
          candidateId,
          authorUserId: userId,
          requestFingerprint: fingerprint,
          OR: [
            { expiresAt: { gt: new Date() }, status: { not: 'FAILED' } },
            { status: { in: ['GENERATING', 'UNKNOWN'] } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (cached) return { row: cached, created: false };
      if (
        input.operationId.slice(0, 10) !== new Date().toISOString().slice(0, 10)
      )
        throw new ConflictException('LEAD_OPERATION_DATE_INVALID');
      if (
        await tx.aiOperation.findFirst({
          where: {
            workspaceId: current.workspaceId,
            OR: [
              { operationId: input.operationId },
              {
                businessObjectId,
                category: 'SALES_FIRST_DRAFT',
                status: { in: ['RUNNING', 'UNKNOWN'] },
              },
            ],
          },
          select: { id: true },
        })
      )
        throw new ConflictException('LEAD_OPERATION_RECONCILIATION_REQUIRED');
      if (
        (await tx.telegramLeadCandidateDraft.count({
          where: {
            workspaceId: current.workspaceId,
            candidateId,
            authorUserId: userId,
          },
        })) >= 20
      )
        throw new ConflictException('LEAD_DRAFT_LIMIT');
      const row = await tx.telegramLeadCandidateDraft.create({
        data: {
          workspaceId: current.workspaceId,
          candidateId,
          authorUserId: userId,
          operationId: input.operationId,
          requestFingerprint: fingerprint,
          contextVersion: current.contextVersion,
          requestSnapshot: {
            productIds: [...input.productIds].sort(),
            tone: input.tone,
            language,
          },
          evidenceRefs: current.observations.map((row) => row.id),
          tone: input.tone,
          language,
          warnings: [],
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      return { row, created: true };
    });
    if (!claimed.created) return this.read.view(userId, candidateId);
    let attempted = false;
    try {
      const before = await this.context.build(
        userId,
        candidateId,
        input.productIds,
        true,
      );
      this.context.assert(before);
      const beforeQualification = await this.approvedQualification(before);
      if (
        before.contextVersion !== current.contextVersion ||
        beforeQualification.id !== qualification.id ||
        before.candidate.qualificationReviewedAt?.getTime() !==
          current.candidate.qualificationReviewedAt?.getTime()
      )
        throw new ConflictException('LEAD_CONTEXT_CHANGED');
      attempted = true;
      const response = await this.gateway.execute({
        userId,
        workspaceId: current.workspaceId,
        category: 'SALES_FIRST_DRAFT',
        operationId: input.operationId,
        mode: 'MANUAL',
        businessObjectId,
        instructions:
          COPILOT_INSTRUCTIONS +
          ' Candidate first offer: no conversation exists. Ukrainian is the default. Propose package placement as the commercial product, using current selected product facts only. Avoid identical generic opening phrases, invented familiarity, pressure or automatic sending. Never claim a channel price is the package total.',
        input: JSON.stringify({
          category: 'SALES_FIRST_DRAFT',
          tone: input.tone,
          language,
          contextVersion: current.contextVersion,
          facts: current.facts,
          missingFacts: current.missingFacts,
        }),
      });
      const after = await this.context.build(
        userId,
        candidateId,
        input.productIds,
        true,
      );
      this.context.assert(after);
      const afterQualification = await this.approvedQualification(after);
      if (
        after.contextVersion !== current.contextVersion ||
        afterQualification.id !== qualification.id ||
        after.candidate.qualificationReviewedAt?.getTime() !==
          current.candidate.qualificationReviewedAt?.getTime()
      )
        throw new ConflictException('LEAD_CONTEXT_CHANGED');
      const output =
        response.result === undefined
          ? null
          : validateCopilotOutput(response.result, current, {
              tone: input.tone,
              language,
            });
      const blocking =
        output?.warnings.filter(
          (warning) =>
            ![
              'MANAGER_APPROVAL_REQUIRED',
              'PACKAGE_QUOTE_REQUIRES_MANAGER',
            ].includes(warning),
        ) ?? [];
      await this.context.prisma.telegramLeadCandidateDraft.updateMany({
        where: {
          id: claimed.row.id,
          workspaceId: current.workspaceId,
          status: 'GENERATING',
        },
        data: {
          operationDbId: response.operation.id,
          status:
            response.operation.status === 'SUCCEEDED' && output
              ? blocking.length
                ? 'REVIEW_REQUIRED'
                : 'READY'
              : response.operation.status === 'UNKNOWN' || response.replayed
                ? 'UNKNOWN'
                : 'FAILED',
          text: output?.suggestedMessage ?? '',
          output: output
            ? (output as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          warnings: output?.warnings ?? [],
        },
      });
    } catch (error) {
      const failure = await leadPreparationFailure(
        this.context.prisma,
        {
          workspaceId: current.workspaceId,
          operationId: input.operationId,
          userId,
        },
        error,
        attempted,
      );
      await this.context.prisma.telegramLeadCandidateDraft.updateMany({
        where: {
          id: claimed.row.id,
          workspaceId: current.workspaceId,
          status: 'GENERATING',
        },
        data: failure,
      });
      throw error;
    }
    return this.read.view(userId, candidateId);
  }
  async patch(
    userId: string,
    candidateId: string,
    draftId: string,
    input: LeadCandidateDraftPatch,
  ) {
    const access = await this.context.policy.access(userId, 'review');
    const row = await this.context.prisma.telegramLeadCandidateDraft.findFirst({
      where: { id: draftId, candidateId, workspaceId: access.workspaceId },
    });
    if (!row) throw new NotFoundException('LEAD_DRAFT_NOT_FOUND');
    if (row.authorUserId !== userId)
      throw new ForbiddenException('LEAD_DRAFT_OWNER_REQUIRED');
    if (
      row.expiresAt <= new Date() ||
      !['READY', 'APPROVED', 'REVIEW_REQUIRED', 'STALE'].includes(row.status)
    )
      throw new ConflictException('LEAD_DRAFT_NOT_EDITABLE');
    if (row.revision !== input.revision)
      throw new ConflictException('LEAD_REVISION_CONFLICT');
    await this.context.policy.refresh(userId);
    const current = await this.context.build(
      userId,
      candidateId,
      preparationProductIds(row.requestSnapshot),
    );
    this.context.assert(current);
    let approvalQualificationId = '';
    if (input.action === 'APPROVE') {
      approvalQualificationId = (await this.approvedQualification(current)).id;
      if (current.contextVersion !== row.contextVersion)
        throw new ConflictException('LEAD_CONTEXT_CHANGED');
      const warnings = copilotTextWarnings(row.text, current);
      if (warnings.length)
        throw new ConflictException('LEAD_DRAFT_ASSERTIONS_REQUIRE_EDIT');
    }
    const text =
      input.action === 'SAVE' ? (input.text ?? row.text).trim() : row.text;
    if (!text || text.length > 3000)
      throw new ConflictException('LEAD_DRAFT_TEXT_INVALID');
    if (
      (input.action === 'SAVE' && text === row.text) ||
      (input.action === 'APPROVE' &&
        row.status === 'APPROVED' &&
        row.approvalHash ===
          leadDraftApprovalHash(
            row.text,
            row.revision,
            row.contextVersion,
            current.candidate,
            approvalQualificationId,
          ))
    )
      return this.read.view(userId, candidateId);
    const status =
      input.action === 'DISCARD'
        ? 'DISCARDED'
        : input.action === 'APPROVE'
          ? 'APPROVED'
          : 'REVIEW_REQUIRED';
    const changed =
      await this.context.prisma.telegramLeadCandidateDraft.updateMany({
        where: {
          id: row.id,
          workspaceId: access.workspaceId,
          revision: input.revision,
          authorUserId: userId,
        },
        data: {
          text,
          status,
          revision: { increment: 1 },
          warnings: copilotTextWarnings(text, current),
          approvedAt: input.action === 'APPROVE' ? new Date() : null,
          approvalHash:
            input.action === 'APPROVE'
              ? leadDraftApprovalHash(
                  text,
                  row.revision + 1,
                  row.contextVersion,
                  current.candidate,
                  approvalQualificationId,
                )
              : null,
        },
      });
    if (!changed.count) throw new ConflictException('LEAD_REVISION_CONFLICT');
    return this.read.view(userId, candidateId);
  }
}

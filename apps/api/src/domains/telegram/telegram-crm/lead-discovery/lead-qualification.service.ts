import { copilotHash } from '../telegram-crm-copilot-context.service';
import { leadPreparationFailure } from './lead-preparation-failure';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  LeadQualificationInput,
  LeadQualificationOutput,
  LeadQualificationDecisionInput,
  LeadQualificationScore,
} from '@telegram-system/shared';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { AiGateway } from '../../../operations/ai/ai-gateway';
import { TelegramLeadPreparationContext } from './lead-preparation-context.service';
import {
  TelegramLeadPreparationReadService,
  preparationProductIds,
} from './lead-preparation-read.service';
import {
  scoreLeadQualification,
  validateLeadQualification,
  LEAD_QUALIFICATION_INSTRUCTIONS,
} from './lead-qualification-policy';
export function assertPreparationOperation(id: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    throw new BadRequestException('LEAD_OPERATION_INVALID');
}
@Injectable()
export class TelegramLeadQualificationService {
  constructor(
    private readonly context: TelegramLeadPreparationContext,
    private readonly read: TelegramLeadPreparationReadService,
    private readonly gateway: AiGateway,
  ) {}
  async qualify(
    userId: string,
    candidateId: string,
    input: LeadQualificationInput,
  ) {
    assertPreparationOperation(input.operationId);
    const current = await this.context.build(
      userId,
      candidateId,
      input.productIds,
      true,
    );
    this.context.assert(current);
    const businessObjectId = `lead-qualification:${copilotHash({ candidateId, contextVersion: current.contextVersion })}`;
    const claimed = await this.context.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `lead-preparation:${current.workspaceId}`,
      );
      const byId = await tx.telegramLeadQualification.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: current.workspaceId,
            operationId: input.operationId,
          },
        },
      });
      if (byId) {
        if (byId.authorUserId !== userId || byId.candidateId !== candidateId)
          throw new ForbiddenException('LEAD_OPERATION_OWNER_REQUIRED');
        if (byId.contextVersion !== current.contextVersion)
          throw new ConflictException('LEAD_OPERATION_CONTEXT_CONFLICT');
        return { row: byId, created: false };
      }
      const existing = await tx.telegramLeadQualification.findFirst({
        where: {
          workspaceId: current.workspaceId,
          candidateId,
          contextVersion: current.contextVersion,
          OR: [
            { expiresAt: { gt: new Date() }, status: { not: 'FAILED' } },
            { status: { in: ['GENERATING', 'UNKNOWN'] } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return { row: existing, created: false };
      if (
        input.operationId.slice(0, 10) !== new Date().toISOString().slice(0, 10)
      )
        throw new BadRequestException('LEAD_OPERATION_DATE_INVALID');
      const receipt = await tx.aiOperation.findFirst({
        where: {
          workspaceId: current.workspaceId,
          OR: [
            { operationId: input.operationId },
            {
              businessObjectId,
              category: 'LEAD_QUALIFICATION',
              status: { in: ['RUNNING', 'UNKNOWN'] },
            },
          ],
        },
        select: { id: true },
      });
      if (receipt)
        throw new ConflictException('LEAD_OPERATION_RECONCILIATION_REQUIRED');
      if (
        (await tx.telegramLeadQualification.count({
          where: { workspaceId: current.workspaceId, candidateId },
        })) >= 20
      )
        throw new ConflictException('LEAD_QUALIFICATION_LIMIT');
      const row = await tx.telegramLeadQualification.create({
        data: {
          workspaceId: current.workspaceId,
          candidateId,
          authorUserId: userId,
          operationId: input.operationId,
          contextVersion: current.contextVersion,
          policyVersion: current.policy.version,
          requestSnapshot: {
            productIds: [...input.productIds].sort(),
            candidate: current.candidate.id,
            policy: current.policy,
            freshness: current.scoreFacts.fresh,
            channels: current.channelFacts.channels,
            checks: current.observations.map((row) => ({
              id: row.id,
              hash: row.contentHash,
              sourceId: row.sourceId,
              classification: row.classification,
              classificationVersion: row.classificationVersion,
              extractionVersion: row.extractionVersion,
              source: {
                title: row.source.title,
                accountId: row.source.accountId,
                channelId: row.source.channelId,
                reference: row.source.processingReference,
                status: row.source.monitoringState,
                own: row.source.allowOwnChannel,
              },
            })),
            candidateFacts: {
              title: current.candidate.title,
              niche: current.candidate.niche,
              offerType: current.candidate.offerType,
              contacts: current.candidate.contacts,
              reviewStatus: current.candidate.reviewStatus,
              riskStatus: current.candidate.riskStatus,
              contactId: current.candidate.contactId,
            },
            products: current.products.map((product) => ({
              id: product.id,
              updatedAt: product.updatedAt,
            })),
          },
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
      if (before.contextVersion !== current.contextVersion)
        throw new ConflictException('LEAD_CONTEXT_CHANGED');
      attempted = true;
      const response = await this.gateway.execute({
        userId,
        workspaceId: current.workspaceId,
        category: 'LEAD_QUALIFICATION',
        operationId: input.operationId,
        mode: 'MANUAL',
        businessObjectId,
        instructions: LEAD_QUALIFICATION_INSTRUCTIONS,
        input: JSON.stringify({
          contextVersion: current.contextVersion,
          project: current.candidate.title,
          offer: current.candidate.offerType,
          contacts: current.contacts,
          observations: current.observations.map((row) => ({
            id: row.id,
            text: row.text,
            classification: row.classification,
            source: row.source.title,
          })),
          products: current.products,
          channelFacts: current.channelFacts.channels,
          facts: current.facts.filter((fact) => fact.kind === 'PURCHASE'),
        }),
      });
      const after = await this.context.build(
        userId,
        candidateId,
        input.productIds,
        true,
      );
      this.context.assert(after);
      const output =
        response.result === undefined
          ? null
          : validateLeadQualification(
              response.result as LeadQualificationOutput,
              current.observations,
            );
      if (output && !current.scoreFacts.verifiedProducts) {
        output.thematicFit = 'UNKNOWN';
        output.missingFacts = [
          ...new Set([
            ...output.missingFacts,
            'VERIFIED_CHANNEL_PRODUCT_CONTEXT_REQUIRED',
          ]),
        ];
      }
      const status =
        response.operation.status === 'SUCCEEDED' && output
          ? 'READY'
          : response.operation.status === 'UNKNOWN' || response.replayed
            ? 'UNKNOWN'
            : 'FAILED';
      if (after.contextVersion !== current.contextVersion)
        throw new ConflictException('LEAD_CONTEXT_CHANGED');
      await this.context.prisma.telegramLeadQualification.updateMany({
        where: {
          id: claimed.row.id,
          workspaceId: current.workspaceId,
          status: 'GENERATING',
        },
        data: {
          operationDbId: response.operation.id,
          status,
          output: output
            ? (output as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
          score: output
            ? (scoreLeadQualification(
                output,
                current.scoreFacts,
                current.policy,
              ) as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
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
      await this.context.prisma.telegramLeadQualification.updateMany({
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
  async decide(
    userId: string,
    candidateId: string,
    input: LeadQualificationDecisionInput,
  ) {
    const access = await this.context.policy.access(userId, 'review');
    const qualification =
      await this.context.prisma.telegramLeadQualification.findFirst({
        where: {
          id: input.qualificationId,
          candidateId,
          workspaceId: access.workspaceId,
          status: 'READY',
          expiresAt: { gt: new Date() },
        },
      });
    if (!qualification)
      throw new ConflictException('LEAD_CURRENT_QUALIFICATION_REQUIRED');
    await this.context.policy.refresh(userId);
    const current = await this.context.build(
      userId,
      candidateId,
      preparationProductIds(qualification.requestSnapshot),
    );
    this.context.assert(current);
    if (
      current.contextVersion !== input.contextVersion ||
      qualification.contextVersion !== current.contextVersion
    )
      throw new ConflictException('LEAD_CONTEXT_CHANGED');
    const score = qualification.score as unknown as LeadQualificationScore;
    if (
      input.decision === 'QUALIFIED' &&
      (current.candidate.reviewStatus !== 'APPROVED' ||
        score.status !== 'SCORED')
    )
      throw new ConflictException('LEAD_HUMAN_CONTACT_REVIEW_REQUIRED');
    if (
      (score.riskLevel === 'RISK_HIGH' ||
        current.candidate.riskStatus === 'SUSPICIOUS') &&
      input.decision === 'QUALIFIED' &&
      (!input.acknowledgeHighRisk || (input.note?.trim().length ?? 0) < 10)
    )
      throw new ConflictException('LEAD_HIGH_RISK_DECISION_REQUIRED');
    if (
      current.candidate.qualificationDecision === input.decision &&
      current.candidate.qualificationContextVersion ===
        current.contextVersion &&
      current.candidate.qualificationReviewedAt !== null &&
      current.candidate.qualificationReviewedAt >= qualification.createdAt &&
      (!(
        score.riskLevel === 'RISK_HIGH' ||
        current.candidate.riskStatus === 'SUSPICIOUS'
      ) ||
        (current.candidate.riskAcknowledgedAt !== null &&
          current.candidate.riskAcknowledgedAt >= qualification.createdAt))
    )
      return this.read.view(userId, candidateId);
    const history = Array.isArray(current.candidate.reviewHistory)
      ? current.candidate.reviewHistory
      : [];
    const changed = await this.context.prisma.telegramLeadCandidate.updateMany({
      where: {
        id: candidateId,
        workspaceId: access.workspaceId,
        revision: input.revision,
        reviewStatus: { notIn: ['REJECTED', 'MERGED'] },
        riskStatus: { not: 'REJECTED' },
      },
      data: {
        qualificationDecision: input.decision,
        qualificationContextVersion: current.contextVersion,
        qualificationReviewedAt: new Date(),
        qualificationReviewerUserId: userId,
        riskAcknowledgedAt: input.acknowledgeHighRisk ? new Date() : null,
        reviewHistory: [
          ...history.slice(-9),
          {
            at: new Date().toISOString(),
            actorUserId: userId,
            action: `QUALIFICATION_${input.decision}`,
            note: input.note?.trim().slice(0, 500) ?? '',
          },
        ],
        revision: { increment: 1 },
      },
    });
    if (!changed.count) throw new ConflictException('LEAD_REVISION_CONFLICT');
    return this.read.view(userId, candidateId);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CRM_COPILOT_CATEGORIES,
  CRM_COPILOT_TONES,
  type CrmCopilotGenerateInput,
  type CrmCopilotDraftPatch,
  type CrmCopilotSuggestInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { AiGateway } from '../../operations/ai/ai-gateway';
import {
  TelegramCrmCopilotContextService,
  copilotHash,
} from './telegram-crm-copilot-context.service';
import {
  TelegramCrmCopilotDraftsService,
  type CopilotSnapshot,
} from './telegram-crm-copilot-drafts.service';
import {
  COPILOT_INSTRUCTIONS,
  assertCopilotEligibility,
  persistedCopilotFacts,
  validateCopilotOutput,
  copilotTextWarnings,
} from './telegram-crm-copilot-policy';
import type { CopilotPreset } from './telegram-crm-copilot-workspace-context';

@Injectable()
export class TelegramCrmCopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: TelegramCrmCopilotContextService,
    private readonly drafts: TelegramCrmCopilotDraftsService,
    private readonly gateway: AiGateway,
  ) {}
  async suggest(
    userId: string,
    conversationId: string,
    input: CrmCopilotSuggestInput,
    signal?: AbortSignal,
  ) {
    const policy = await this.context.suggestionOptions(userId, conversationId);
    return this.generate(
      userId,
      conversationId,
      {
        operationId: input.operationId,
        category: 'SALES_REPLY_SUGGESTION',
        tone: 'NATURAL',
        language: 'AUTO',
        productIds: [],
        ...policy,
        processingBasis: 'APPROVED_BUSINESS_PROCESSING',
        sourceAcknowledged: Boolean(policy.processingReference),
        preset: 'WORKSPACE_NEXT_MESSAGE',
      },
      signal,
    );
  }
  async generate(
    userId: string,
    conversationId: string,
    input: CrmCopilotGenerateInput & CopilotPreset,
    signal?: AbortSignal,
  ) {
    if (
      !CRM_COPILOT_CATEGORIES.includes(input.category) ||
      !CRM_COPILOT_TONES.includes(input.tone) ||
      !['AUTO', 'uk', 'ru', 'en'].includes(input.language) ||
      !Array.isArray(input.productIds) ||
      input.productIds.length > 5 ||
      !/^\d{4}-\d{2}-\d{2}:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.operationId,
      )
    )
      throw new BadRequestException('COPILOT_INPUT_INVALID');
    const access = await this.context.access(userId, conversationId);
    if (input.preset)
      input = {
        ...input,
        feedbackBefore: input.feedbackBefore ?? new Date().toISOString(),
      };
    const fingerprint = copilotHash([
      conversationId,
      userId,
      input.operationId,
      input.category,
      input.tone,
      input.language,
      [...input.productIds].sort(),
      input.includeNotes,
      input.processingBasis,
      input.processingReference,
      input.sourceAcknowledged,
      ...(input.preset ? [input.preset] : []),
    ]);
    const replay = await this.drafts.replay(
      access.workspaceId,
      userId,
      conversationId,
      input.operationId,
      fingerprint,
    );
    if (replay) return this.drafts.view(replay);
    if (
      input.operationId.slice(0, 10) !== new Date().toISOString().slice(0, 10)
    )
      throw new BadRequestException('COPILOT_OPERATION_DATE_INVALID');
    const context = await this.context.build(userId, conversationId, input);
    assertCopilotEligibility(context, input);
    const snapshot: CopilotSnapshot = {
      ...input,
      identityVersion: context.identityVersion,
    };
    const claimed = await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `crm-copilot:${context.workspaceId}`,
      );
      const existing = await tx.telegramCrmAiDraft.findUnique({
        where: {
          workspaceId_operationId: {
            workspaceId: context.workspaceId,
            operationId: input.operationId,
          },
        },
      });
      if (existing) {
        if (
          existing.authorUserId !== userId ||
          existing.conversationId !== conversationId
        )
          throw new ForbiddenException('COPILOT_DRAFT_OWNER_REQUIRED');
        if (existing.requestFingerprint !== fingerprint)
          throw new ConflictException('COPILOT_OPERATION_CONFLICT');
        return { draft: existing, created: false };
      }
      // Reopening the UI or racing another click must not buy a second reply
      // while the first provider outcome is still unresolved.
      if (input.preset) {
        const pending = await tx.telegramCrmAiDraft.findFirst({
          where: {
            workspaceId: context.workspaceId,
            conversationId,
            authorUserId: userId,
            status: { in: ['GENERATING', 'UNKNOWN'] },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        if (pending) return { draft: pending, created: false };
      }
      const retained = await tx.telegramCrmAiDraft.count({
        where: {
          workspaceId: context.workspaceId,
          conversationId,
          authorUserId: userId,
        },
      });
      if (retained >= 20) throw new ConflictException('COPILOT_DRAFT_LIMIT');
      const draft = await tx.telegramCrmAiDraft.create({
        data: {
          workspaceId: context.workspaceId,
          conversationId,
          contactId: context.contactId!,
          authorUserId: userId,
          operationId: input.operationId,
          category: input.category,
          tone: input.tone,
          language: input.language,
          status: 'GENERATING',
          facts: persistedCopilotFacts(context.facts),
          missingFacts: context.missingFacts,
          warnings: context.warnings,
          contextVersion: context.contextVersion,
          requestFingerprint: fingerprint,
          requestSnapshot: snapshot,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      return { draft, created: true };
    });
    if (!claimed.created) return this.drafts.view(claimed.draft);
    let response: Awaited<ReturnType<AiGateway['execute']>>;
    let gatewayAttempted = false;
    try {
      // Recheck current eligibility after the claim before any external token-count call.
      await this.context.refreshAccess(userId);
      const current = await this.context.build(userId, conversationId, input);
      assertCopilotEligibility(current, input);
      if (current.contextVersion !== context.contextVersion)
        throw new ConflictException('COPILOT_CONTEXT_CHANGED');
      if (signal?.aborted)
        throw new ConflictException('COPILOT_CANCELLED_BEFORE_SEND');
      gatewayAttempted = true;
      response = await this.gateway.execute({
        signal,
        userId,
        workspaceId: context.workspaceId,
        category: input.category,
        operationId: input.operationId,
        mode: 'MANUAL',
        businessObjectId: claimed.draft.id,
        instructions: COPILOT_INSTRUCTIONS,
        input: JSON.stringify({
          asOf: new Date().toISOString(),
          task: input.category,
          tone: input.tone,
          language: input.language,
          contextVersion: context.contextVersion,
          facts: context.facts,
          missingFacts: context.missingFacts,
          warnings: context.warnings,
        }),
      });
    } catch (error) {
      const receipt = await this.prisma.aiOperation.findFirst({
        where: {
          workspaceId: context.workspaceId,
          operationId: input.operationId,
          businessObjectId: claimed.draft.id,
        },
      });
      const code =
        error instanceof Error && /^(?:AI|COPILOT)_[A-Z_]+$/.test(error.message)
          ? error.message
          : null;
      const safeNoCall =
        !gatewayAttempted ||
        (!receipt && code !== null && code !== 'AI_SETTLEMENT_UNCERTAIN');
      const failed = await this.prisma.telegramCrmAiDraft.update({
        where: { id: claimed.draft.id },
        data: {
          status:
            safeNoCall || receipt?.status === 'FAILED' ? 'FAILED' : 'UNKNOWN',
          operationDbId: receipt?.id ?? null,
          warnings: [
            safeNoCall
              ? (code ?? 'COPILOT_PRECALL_CHECK_FAILED')
              : 'GENERATION_UNCERTAIN_NO_AUTOMATIC_RETRY',
          ],
        },
      });
      return this.drafts.view(failed);
    }
    // Generation can outlive membership, ownership, DNC or price changes.
    let contextChanged = false;
    try {
      await this.context.refreshAccess(userId);
      const current = await this.context.build(userId, conversationId, input);
      assertCopilotEligibility(current, input);
      contextChanged = current.contextVersion !== context.contextVersion;
    } catch {
      await this.prisma.telegramCrmAiDraft.update({
        where: { id: claimed.draft.id },
        data: {
          status: 'FAILED',
          operationDbId: response.operation.id,
          warnings: ['ACCESS_OR_ELIGIBILITY_CHANGED'],
        },
      });
      throw new ForbiddenException('COPILOT_ACCESS_CHANGED');
    }
    // A gateway replay cannot reconstruct output: never hide a second paid request.
    let output: ReturnType<typeof validateCopilotOutput> | undefined;
    if (
      response.operation.status === 'SUCCEEDED' &&
      response.result !== undefined
    ) {
      try {
        output = validateCopilotOutput(response.result, context, input);
      } catch {
        /* Billed but unsafe output is retained as a failed draft without its text. */
      }
    }
    const status = contextChanged
      ? 'STALE'
      : output
        ? copilotTextWarnings(output.suggestedMessage, context).length
          ? 'REVIEW_REQUIRED'
          : 'READY'
        : response.operation.status === 'UNKNOWN' || response.replayed
          ? 'UNKNOWN'
          : 'FAILED';
    const saved = await this.prisma.telegramCrmAiDraft.update({
      where: { id: claimed.draft.id },
      data: {
        status,
        operationDbId: response.operation.id,
        ...(output
          ? {
              text: output.suggestedMessage,
              output: output as unknown as Prisma.InputJsonValue,
              missingFacts: output.missingFacts,
              warnings: output.warnings,
            }
          : {
              warnings: [
                response.operation.errorCategory
                  ? `AI_${response.operation.errorCategory}`
                  : 'GENERATION_OUTPUT_UNAVAILABLE_NO_AUTOMATIC_RETRY',
              ],
            }),
      },
    });
    return this.drafts.view(saved);
  }
  async patch(
    userId: string,
    conversationId: string,
    draftId: string,
    patch: CrmCopilotDraftPatch,
  ) {
    const draft = await this.drafts.own(userId, conversationId, draftId);
    if (draft.revision !== patch.revision)
      throw new ConflictException('COPILOT_DRAFT_REVISION_CHANGED');
    if (
      draft.expiresAt <= new Date() ||
      !['READY', 'REVIEW_REQUIRED', 'APPROVED', 'STALE'].includes(draft.status)
    )
      throw new ConflictException('COPILOT_DRAFT_NOT_EDITABLE');
    const text = (patch.text ?? draft.text).trim();
    if (text.length > 3000 || (!text && patch.action !== 'DISCARD'))
      throw new BadRequestException('COPILOT_TEXT_INVALID');
    if (patch.action === 'SAVE' && text === draft.text)
      return this.drafts.view(draft);
    let warnings: string[] = [];
    if (patch.action === 'APPROVE') {
      const input = draft.requestSnapshot as unknown as CopilotSnapshot;
      const current = await this.context.build(userId, conversationId, input);
      assertCopilotEligibility(current, input);
      if (
        current.contactId !== draft.contactId ||
        current.contextVersion !== draft.contextVersion
      )
        throw new ConflictException('COPILOT_CONTEXT_STALE');
      warnings = copilotTextWarnings(text, current);
      if (warnings.length)
        throw new ConflictException({
          message: 'COPILOT_UNVERIFIED_ASSERTIONS',
          warnings,
        });
    }
    if (
      patch.action === 'APPROVE' &&
      draft.status === 'APPROVED' &&
      text === draft.text &&
      draft.approvedTextHash === copilotHash(text)
    )
      return this.drafts.view(draft);
    const approved = patch.action === 'APPROVE';
    const changed = await this.prisma.telegramCrmAiDraft.updateMany({
      where: {
        id: draft.id,
        workspaceId: draft.workspaceId,
        authorUserId: userId,
        revision: patch.revision,
        status: draft.status,
      },
      data: {
        text,
        status: approved
          ? 'APPROVED'
          : patch.action === 'DISCARD'
            ? 'DISCARDED'
            : 'READY',
        revision: { increment: 1 },
        approvedAt: approved ? new Date() : null,
        approvedTextHash: approved ? copilotHash(text) : null,
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('COPILOT_DRAFT_REVISION_CHANGED');
    return this.drafts.view(
      await this.drafts.own(userId, conversationId, draftId),
    );
  }
}

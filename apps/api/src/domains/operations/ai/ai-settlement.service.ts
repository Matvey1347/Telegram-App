import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type AiOperation } from '@prisma/client';
import type { AiPrice, AiReconciliationInput } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { EMPTY_USAGE, priceUsage } from './ai-pricing';
import { settleAiBuckets, writeAiRollup } from './ai-rollup';
import type { AiProviderOutcome } from './ai-provider';

@Injectable()
export class AiSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}
  async settle(
    operation: AiOperation,
    outcome: AiProviderOutcome,
    durableVersion?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `internal-ai:${operation.workspaceId}`,
      );
      const fresh = await tx.aiOperation.findUniqueOrThrow({
        where: { id: operation.id },
      });
      if (fresh.status !== 'RUNNING') return fresh;
      let durableOutput: Prisma.InputJsonValue | undefined;
      let outputUnavailable = false;
      if (
        durableVersion &&
        !outcome.errorCategory &&
        outcome.generationStarted
      ) {
        try {
          const encoded = JSON.stringify(outcome.result);
          if (
            !encoded ||
            Buffer.byteLength(encoded, 'utf8') > 64 * 1024 ||
            outcome.result === null ||
            typeof outcome.result !== 'object' ||
            Array.isArray(outcome.result)
          )
            outputUnavailable = true;
          else durableOutput = JSON.parse(encoded) as Prisma.InputJsonValue;
        } catch {
          outputUnavailable = true;
        }
      }
      const price = fresh.pricingSnapshot as unknown as AiPrice;
      const modelCompatible = outcome.providerModel === fresh.model;
      const actualCost =
        outcome.usage && modelCompatible
          ? priceUsage(price, outcome.usage)
          : null;
      const knownNotSent = !outcome.generationStarted;
      const notSentWithoutError = Boolean(
        durableVersion && knownNotSent && !outcome.errorCategory,
      );
      const resolved =
        !outputUnavailable && (actualCost !== null || knownNotSent);
      const status = resolved
        ? outcome.errorCategory || notSentWithoutError
          ? 'FAILED'
          : 'SUCCEEDED'
        : 'UNKNOWN';
      const pricingStatus = knownNotSent
        ? 'NOT_SENT'
        : actualCost !== null
          ? 'PRICED'
          : outcome.usage
            ? 'UNPRICED'
            : 'UNKNOWN';
      if (durableOutput !== undefined)
        await tx.aiOperationResult.create({
          data: {
            operationDbId: fresh.id,
            version: durableVersion!,
            output: durableOutput,
          },
        });
      // Uncertain outcomes retain the full reservation until explicit reconciliation.
      if (resolved) await settleAiBuckets(tx, fresh, actualCost);
      const updated = await tx.aiOperation.update({
        where: { id: fresh.id },
        data: {
          status,
          pricingStatus,
          actualCost,
          ...(outcome.usage ?? EMPTY_USAGE),
          providerModel: outcome.providerModel,
          providerRequestId: outcome.providerRequestId,
          errorCategory:
            (outputUnavailable
              ? 'RESULT_UNAVAILABLE'
              : notSentWithoutError
                ? 'PROVIDER_NOT_DISPATCHED'
                : outcome.errorCategory) ??
            (!modelCompatible
              ? 'PROVIDER_MODEL_MISMATCH'
              : !outcome.usage
                ? 'USAGE_MISSING'
                : actualCost === null
                  ? 'USAGE_UNPRICED'
                  : null),
          durationMs: Math.max(0, Date.now() - fresh.createdAt.getTime()),
          finishedAt: new Date(),
        },
      });
      await writeAiRollup(tx, updated);
      return updated;
    });
  }
  async readDurableResult(operation: AiOperation, version: string) {
    if (
      !['SUCCEEDED', 'RECONCILED'].includes(operation.status) ||
      (operation.status === 'RECONCILED' &&
        operation.providerModel !== operation.model)
    )
      return undefined;
    const row = await this.prisma.aiOperationResult.findUnique({
      where: { operationDbId: operation.id },
    });
    return row?.version === version ? row.output : undefined;
  }
  async reconcile(
    userId: string,
    operationDbId: string,
    input: AiReconciliationInput,
  ) {
    const context = await this.authorization.require(
      userId,
      'operations.manageAi',
    );
    if (
      !/^(invoice|provider|audit):[A-Za-z0-9_.-]{1,80}$/.test(input.evidence) ||
      !/^(0|[1-9]\d{0,11})(\.\d{1,12})?$/.test(input.actualCost)
    )
      throw new BadRequestException('AI_RECONCILIATION_INVALID');
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `internal-ai:${context.workspaceId}`,
      );
      const operation = await tx.aiOperation.findFirst({
        where: { id: operationDbId, workspaceId: context.workspaceId },
      });
      if (!operation) throw new NotFoundException('AI_OPERATION_NOT_FOUND');
      if (
        operation.status !== 'UNKNOWN' &&
        !(operation.status === 'RUNNING' && operation.deadlineAt <= new Date())
      )
        throw new ConflictException('AI_RECONCILIATION_NOT_ALLOWED');
      const actualCost = new Prisma.Decimal(input.actualCost);
      await settleAiBuckets(tx, operation, actualCost);
      if (operation.status === 'UNKNOWN')
        await writeAiRollup(tx, operation, -1);
      const updated = await tx.aiOperation.update({
        where: { id: operation.id },
        data: {
          status: 'RECONCILED',
          pricingStatus: 'MANUAL',
          actualCost,
          reconciliationReference: input.evidence,
          reconciledByUserId: userId,
          finishedAt: new Date(),
        },
      });
      await writeAiRollup(tx, updated);
      return updated;
    });
  }
}

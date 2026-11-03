import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AiOperation } from '@prisma/client';
import type {
  AiOperationView,
  AiReconciliationInput,
} from '@telegram-system/shared';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  AiAdmissionService,
  type AiExecutionRequest,
} from './ai-admission.service';
import { AiLocalConcurrency } from './ai-local-concurrency';
import { AiProvider } from './ai-provider';
import { AiSettlementService } from './ai-settlement.service';
import { mapAiOperationView } from './ai-operation-presentation';

/** Trusted server use cases only. No HTTP execution endpoint or business producer. */
@Injectable()
export class AiGateway {
  constructor(
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly admission: AiAdmissionService,
    private readonly pool: AiLocalConcurrency,
    private readonly provider: AiProvider,
    private readonly settlement: AiSettlementService,
  ) {}
  private async authorize(request: AiExecutionRequest) {
    const context = await this.authorization.require(
      request.userId,
      'operations.executeAi',
    );
    if (context.workspaceId !== request.workspaceId)
      throw new ForbiddenException('AI_WORKSPACE_MISMATCH');
    if (
      request.category.startsWith('SALES_') ||
      request.category.startsWith('LEAD_')
    )
      await this.authorization.require(request.userId, 'adSales.crm.view');
  }
  /** Never creates a new operation, even if the receipt has expired or vanished. */
  async replay(request: AiExecutionRequest) {
    await this.authorize(request);
    const operation = await this.admission.replay(request);
    const result = request.durableVersion
      ? await this.settlement.readDurableResult(
          operation,
          request.durableVersion,
        )
      : undefined;
    return {
      operation: mapAiOperationView(operation),
      ...(result !== undefined ? { result } : {}),
      replayed: true,
    };
  }
  async execute(request: AiExecutionRequest): Promise<{
    operation: AiOperationView;
    result?: unknown;
    replayed: boolean;
  }> {
    await this.authorize(request);
    // A separate singleton enforces process-wide capacity across request-scoped callers.
    const release = this.pool.acquire();
    try {
      const admitted = await this.admission.admit(request);
      if (admitted.replayed) {
        const result = request.durableVersion
          ? await this.settlement.readDurableResult(
              admitted.operation,
              request.durableVersion,
            )
          : undefined;
        return {
          operation: mapAiOperationView(admitted.operation),
          ...(result !== undefined ? { result } : {}),
          replayed: true,
        };
      }
      const outcome = await this.provider.execute(
        request.input,
        {
          ...admitted.config,
          timeoutMs: Math.max(
            1,
            admitted.operation.deadlineAt.getTime() - Date.now(),
          ),
        },
        request.signal,
        request.instructions,
        request.image,
      );
      let operation: AiOperation;
      try {
        operation = request.durableVersion
          ? await this.settlement.settle(
              admitted.operation,
              outcome,
              request.durableVersion,
            )
          : await this.settlement.settle(admitted.operation, outcome);
      } catch {
        // Never re-run a provider after an uncertain database commit. Reservation stays held.
        throw new ServiceUnavailableException('AI_SETTLEMENT_UNCERTAIN');
      }
      return {
        operation: mapAiOperationView(operation),
        ...((!request.durableVersion || operation.status === 'SUCCEEDED') &&
        outcome.result !== undefined
          ? { result: outcome.result }
          : {}),
        replayed: false,
      };
    } finally {
      release();
    }
  }
  async reconcile(
    userId: string,
    operationDbId: string,
    input: AiReconciliationInput,
  ) {
    return mapAiOperationView(
      await this.settlement.reconcile(userId, operationDbId, input),
    );
  }
}

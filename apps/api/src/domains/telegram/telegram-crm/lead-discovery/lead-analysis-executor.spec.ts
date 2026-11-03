import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadAnalysisExecutor } from './lead-analysis-executor.service';
import * as claims from './lead-analysis-claim';
import * as routing from './lead-analysis-routing';

jest.mock('./lead-analysis-claim', () => ({
  claimLeadAnalysis: jest.fn(),
  expireLeadAnalysisClaims: jest.fn(),
  finishLeadAnalysisClaim: jest.fn(),
  recoverDurableLeadClaims: jest.fn(),
}));
jest.mock('./lead-analysis-routing', () => ({ routeLeadAnalysis: jest.fn() }));

describe('lead executor automatic AI gate', () => {
  it('does not start an automatic drain outside the source allowlist', () => {
    const prisma = { telegramLeadAutoConfig: { findMany: jest.fn() } };
    const config = {
      get: (key: string) =>
        key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
          ? 'true'
          : key === 'INTERNAL_LEAD_DISCOVERY_SOURCE_ALLOWLIST'
            ? 'permitted'
            : undefined,
    };
    const executor = new TelegramLeadAnalysisExecutor(
      prisma as unknown as PrismaService,
      {} as ModuleRef,
      config as unknown as ConfigService,
    );
    executor.wake({
      workspaceId: 'workspace',
      sourceId: 'other',
      userId: 'actor',
    });
    expect(prisma.telegramLeadAutoConfig.findMany).not.toHaveBeenCalled();
    executor.onApplicationShutdown();
  });
  it('sends an unverified positive text result to review without AI', async () => {
    const analyzeAutomatically = jest.fn();
    const executor = new TelegramLeadAnalysisExecutor(
      {
        telegramLeadAnalysisQueue: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      } as unknown as PrismaService,
      {} as ModuleRef,
      {} as ConfigService,
    );
    Object.defineProperty(executor, 'services', {
      value: jest.fn().mockResolvedValue({
        reconciliation: {
          reconcilePage: jest
            .fn()
            .mockResolvedValue({ blocked: false, complete: true }),
        },
        analysis: { analyzeAutomatically },
        policy: { recheckAi: jest.fn() },
        candidates: { materialCandidate: jest.fn() },
      }),
    });
    jest
      .mocked(claims.claimLeadAnalysis)
      .mockResolvedValueOnce({
        actorUserId: 'actor',
        observationId: 'post',
      } as never)
      .mockResolvedValueOnce(null);
    jest.mocked(claims.finishLeadAnalysisClaim).mockResolvedValue(1);
    jest.mocked(routing.routeLeadAnalysis).mockResolvedValue({
      decision: 'LIKELY_AD',
      deterministicTitle: null,
      mediaUnanalyzed: true,
      directContacts: [],
    } as never);
    await executor.runSource({
      workspaceId: 'workspace',
      sourceId: 'source',
      userId: 'actor',
    });
    expect(claims.finishLeadAnalysisClaim).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'NEEDS_REVIEW',
    );
    expect(analyzeAutomatically).not.toHaveBeenCalled();
    jest.clearAllMocks();
  });
  it.each([
    ['AI_AUTOMATIC_DISABLED', false],
    ['AI_BUDGET_EXCEEDED', true],
  ])(
    'stops the drain for %s and disables the source: %s',
    async (code, disabled) => {
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });
      const transaction = jest.fn(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({ $queryRaw: jest.fn(), telegramLeadAutoConfig: { updateMany } }),
      );
      const executor = new TelegramLeadAnalysisExecutor(
        {
          $transaction: transaction,
          aiCategoryConfig: {
            findMany: jest
              .fn()
              .mockResolvedValue([
                { category: 'LEAD_AD_CLASSIFICATION' },
                { category: 'LEAD_CONTACT_EXTRACTION' },
              ]),
          },
        } as unknown as PrismaService,
        {} as ModuleRef,
        {} as ConfigService,
      );
      Object.defineProperty(executor, 'services', {
        value: jest.fn().mockResolvedValue({
          reconciliation: {
            reconcilePage: jest
              .fn()
              .mockResolvedValue({ blocked: false, complete: true }),
          },
          analysis: {
            analyzeAutomatically: jest
              .fn()
              .mockResolvedValue({ failed: 1, failures: [{ code }] }),
          },
          policy: {},
          candidates: {},
        }),
      });
      jest.mocked(claims.claimLeadAnalysis).mockResolvedValue({
        actorUserId: 'actor',
        observationId: 'observation',
        bindingRevision: 1,
      } as never);
      jest.mocked(claims.finishLeadAnalysisClaim).mockResolvedValue(1);
      jest.mocked(routing.routeLeadAnalysis).mockResolvedValue({
        decision: 'NEEDS_AI',
        mediaUnanalyzed: false,
      } as never);
      await expect(
        executor.runSource({
          workspaceId: 'workspace',
          sourceId: 'source',
          userId: 'actor',
        }),
      ).resolves.toBe(false);
      expect(claims.finishLeadAnalysisClaim).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'FAILED',
        code,
      );
      expect(transaction).toHaveBeenCalledTimes(disabled ? 1 : 0);
      expect(updateMany).toHaveBeenCalledTimes(disabled ? 1 : 0);
      jest.clearAllMocks();
    },
  );
});

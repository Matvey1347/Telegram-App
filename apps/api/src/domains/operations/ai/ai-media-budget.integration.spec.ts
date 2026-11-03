import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AiAdmissionService,
  type AiExecutionRequest,
} from './ai-admission.service';
import { AiModelRegistry } from './ai-model-registry';
import type { PrismaService } from '../../../prisma/prisma.service';

const url = process.env.LEAD_METADATA_TEST_DATABASE_URL;
(url ? describe : describe.skip)('media pilot budget with PostgreSQL', () => {
  it('serializes concurrent reservations and keeps uncertain cost reserved', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const workspaceId = `pilot-budget-${randomUUID()}`;
    try {
      await prisma.workspace.create({
        data: { id: workspaceId, name: 'Synthetic' },
      });
      await prisma.aiWorkspaceConfig.create({
        data: {
          workspaceId,
          enabled: true,
          automaticEnabled: false,
          dailyBudget: '5',
          monthlyBudget: '5',
          maxRequestCost: '1',
        },
      });
      await prisma.aiCategoryConfig.create({
        data: {
          workspaceId,
          category: 'LEAD_AD_CLASSIFICATION',
          modelId: 'gpt-5.4-mini-2026-03-17',
          enabled: true,
          automaticEnabled: false,
          maxInputTokens: 8000,
          maxOutputTokens: 1000,
          timeoutMs: 30000,
          concurrencyLimit: 8,
          dailyBudget: '5',
          monthlyBudget: '5',
          maxRequestCost: '1',
        },
      });
      const service = new AiAdmissionService(
        prisma as unknown as PrismaService,
        new AiModelRegistry(),
        { enabled: true, configured: true } as never,
      );
      const request = (): AiExecutionRequest => ({
        userId: 'actor',
        workspaceId,
        category: 'LEAD_AD_CLASSIFICATION',
        mode: 'MANUAL',
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        input: 'caption',
        businessObjectId: randomUUID(),
        durableVersion: 'lead-media-vision-v1',
        mediaPilotSourceId: 'source',
        image: { mime: 'image/jpeg', data: Buffer.from([255, 216, 255, 1]) },
      });
      const first = await service.admit(request());
      await prisma.aiOperation.update({
        where: { id: first.operation.id },
        data: { status: 'UNKNOWN', reservedCost: '0.985' },
      });
      const results = await Promise.allSettled([
        service.admit(request()),
        service.admit(request()),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult;
      expect((rejected.reason as Error).message).toBe(
        'AI_MEDIA_PILOT_BUDGET_EXHAUSTED',
      );
      expect(await prisma.aiOperation.count({ where: { workspaceId } })).toBe(
        2,
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});

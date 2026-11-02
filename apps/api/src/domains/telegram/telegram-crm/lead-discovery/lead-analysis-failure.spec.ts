import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { recordLeadAnalysisFailure } from './lead-analysis-failure';

describe('lead replay failure fencing', () => {
  it('never clears an operation ID when its replay receipt is missing', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      aiOperation: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramLeadObservation: { updateMany },
    } as unknown as PrismaService;
    const result = await recordLeadAnalysisFailure(
      prisma,
      {
        workspaceId: 'workspace',
        id: 'post',
        hash: 'hash',
        operationId: 'previous-paid-operation',
        stage: 'classification',
        userId: 'actor',
      },
      new ConflictException('AI_REPLAY_UNAVAILABLE'),
      true,
      undefined,
      true,
    );
    expect(result).toBe('unknown');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ processingStatus: 'UNKNOWN' }),
      }),
    );
    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'classificationOperationId',
    );
  });
});

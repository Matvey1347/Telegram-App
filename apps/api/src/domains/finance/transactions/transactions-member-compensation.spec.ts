import { BadRequestException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

function createService() {
  const prisma = {
    transaction: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'salary-transaction-1',
        workspaceId: 'workspace-1',
        deletedAt: null,
        memberCompensationSettlement: { id: 'settlement-1' },
      }),
      update: jest.fn(),
    },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const financeCategories = { ensureSystemCategories: jest.fn() };
  const authorization = { requireOwnOrAny: jest.fn() };
  const service = new TransactionsService(
    prisma as never,
    workspaceService as never,
    {} as never,
    financeCategories as never,
    authorization as never,
  );
  return { service, prisma, authorization };
}

describe('TransactionsService member compensation protection', () => {
  it('does not let the generic transaction editor alter a salary payout', async () => {
    const { service, authorization } = createService();

    await expect(
      service.update('owner-1', 'salary-transaction-1', { amount: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authorization.requireOwnOrAny).not.toHaveBeenCalled();
  });

  it('does not let the generic transaction list remove a salary payout', async () => {
    const { service, prisma, authorization } = createService();

    await expect(
      service.remove('owner-1', 'salary-transaction-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authorization.requireOwnOrAny).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});

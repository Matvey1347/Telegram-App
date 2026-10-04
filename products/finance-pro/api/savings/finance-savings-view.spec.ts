import { Prisma } from '@prisma/client';
import { financeSavingsGoalView } from './finance-savings-view';

const now = new Date('2026-09-08T00:00:00.000Z');
const base = {
  id: 'goal-1',
  name: 'Home',
  targetAmount: new Prisma.Decimal(1000),
  currency: 'USD',
  targetDate: null,
  note: null,
  status: 'ACTIVE' as const,
  currentAllocated: new Prisma.Decimal(500),
  linkedAllocated: new Prisma.Decimal(400),
  legacyUnlinkedAmount: new Prisma.Decimal(100),
  completedAt: null,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};

describe('financeSavingsGoalView', () => {
  it('keeps purpose allocation separate from physical backing', () => {
    expect(financeSavingsGoalView(base, new Prisma.Decimal(250))).toMatchObject(
      {
        currentAllocated: '500',
        linkedAllocated: '400',
        backedAmount: '250',
        remainingAmount: '500',
        progressPercentage: 50,
        fundingStatus: 'UNLINKED_LEGACY',
      },
    );
  });
});

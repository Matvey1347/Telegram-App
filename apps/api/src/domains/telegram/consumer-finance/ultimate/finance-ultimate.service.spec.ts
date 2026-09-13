import { ForbiddenException } from '@nestjs/common';
import type { ConsumerFinanceAnalytics } from '@telegram-system/shared';
import { FinanceUltimateService } from './finance-ultimate.service';

const context = {
  profileId: 'profile-1',
  botIntegrationId: 'bot-1',
  workspaceId: 'workspace-1',
  telegramBotUserId: 'user-1',
};
const question = {
  question: 'What changed?',
  period: 'CURRENT_MONTH' as const,
};

function analyticsFixture(): ConsumerFinanceAnalytics {
  return {
    currency: 'UAH',
    period: {
      period: 'CURRENT_MONTH',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
    },
    summary: {
      income: '1000',
      expenses: '400',
      saved: '100',
      invested: '0',
      investmentReturns: '0',
      netCashflow: '600',
      requiredExpenses: '300',
      discretionaryExpenses: '100',
      unspecifiedExpenses: '0',
    },
    comparison: {
      period: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      },
      summary: {
        income: '800',
        expenses: '500',
        saved: '80',
        invested: '0',
        investmentReturns: '0',
        netCashflow: '300',
        requiredExpenses: '300',
        discretionaryExpenses: '100',
        unspecifiedExpenses: '100',
      },
    },
    expensesByCategory: Array.from({ length: 8 }, (_, index) => ({
      categoryId: `expense-${index}`,
      categoryKey: null,
      name: `Expense ${index}`,
      amount: String(80 - index),
      percentage: 10,
    })),
    incomeByCategory: Array.from({ length: 8 }, (_, index) => ({
      categoryId: `income-${index}`,
      categoryKey: null,
      name: `Income ${index}`,
      amount: String(100 - index),
      percentage: 10,
    })),
    accounts: Array.from({ length: 8 }, (_, index) => ({
      accountId: `account-${index}`,
      name: `Account ${index}`,
      income: '100',
      expenses: '40',
      invested: '0',
      investmentReturns: '0',
      netCashflow: '60',
    })),
    timeline: Array.from({ length: 14 }, (_, index) => ({
      date: `${2025 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`,
      income: '100',
      expenses: '40',
      saved: '0',
      invested: '0',
      investmentReturns: '0',
      netCashflow: '60',
    })),
    trends: [],
    legacyFallback: null,
    savings: {
      currency: 'UAH',
      allocated: '0',
      backed: '0',
      activeGoals: 0,
      completedGoals: 0,
      underfundedGoals: 0,
      excludedGoals: [],
    },
    investments: {
      currency: 'UAH',
      totalInvested: '0',
      totalReturned: '0',
      currentValue: '0',
      profitLoss: '0',
      returnPercentage: null,
      activeInvestments: 0,
      closedInvestments: 0,
      excludedInvestments: [],
    },
    netWorth: {
      amount: '0',
      currency: 'UAH',
      cashAmount: '0',
      investmentValue: '0',
      complete: true,
      excludedAccountCount: 0,
      excludedInvestmentCount: 0,
    },
  };
}

function setup() {
  const prisma = {
    financeProfile: {
      findUnique: jest.fn().mockResolvedValue({
        defaultCurrency: 'UAH',
        timezone: 'Europe/Kyiv',
        locale: 'uk',
        telegramUser: { languageCode: 'uk' },
      }),
    },
    aiUsageEvent: { update: jest.fn().mockResolvedValue({}) },
    financeTransaction: {
      findMany: jest.fn().mockResolvedValue([
        {
          type: 'EXPENSE',
          purpose: 'ORDINARY',
          amount: { toString: () => '25' },
          economicAmount: { toString: () => '25' },
          currency: 'UAH',
          necessity: 'REQUIRED',
          occurredAt: new Date('2026-09-10T10:00:00.000Z'),
          description: 'Groceries',
          account: { name: 'Card' },
          category: { name: 'Food' },
        },
      ]),
    },
  };
  const analytics = {
    analytics: jest.fn().mockResolvedValue(analyticsFixture()),
  };
  const ai = {
    interpret: jest.fn().mockResolvedValue({
      answer: 'Generated answer',
      suggestedQuestions: ['Next question?'],
    }),
    routeAssistantMessage: jest.fn().mockResolvedValue({
      kind: 'ANSWER',
      message: 'Expected card balance is 75 UAH.',
      recommendedScreen: null,
      operations: [],
    }),
  };
  const entitlements = {
    reserveCapability: jest.fn().mockResolvedValue({ id: 'reservation-1' }),
  };
  const ledger = {
    accounts: jest.fn().mockResolvedValue([
      {
        name: 'Card',
        type: 'CARD',
        balance: '75',
        currency: 'UAH',
        archivedAt: null,
      },
    ]),
  };
  const proposals = {
    createBatch: jest.fn().mockResolvedValue({
      token: 'proposal-token',
      operations: [],
      preview: [],
    }),
  };
  return {
    prisma,
    analytics,
    ai,
    entitlements,
    ledger,
    proposals,
    service: new FinanceUltimateService(
      prisma as never,
      analytics as never,
      ai as never,
      entitlements as never,
      ledger as never,
      proposals as never,
    ),
  };
}

describe('FinanceUltimateService', () => {
  it('denies access before loading a profile or analytics', async () => {
    const { service, entitlements, prisma, analytics, ai } = setup();
    entitlements.reserveCapability.mockRejectedValue(
      new ForbiddenException('Ultimate required'),
    );

    await expect(service.answer(context, question)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.financeProfile.findUnique).not.toHaveBeenCalled();
    expect(analytics.analytics).not.toHaveBeenCalled();
    expect(ai.interpret).not.toHaveBeenCalled();
  });

  it('sends only compact aggregate facts and returns deterministic totals separately', async () => {
    const { service, entitlements, ai } = setup();

    const result = await service.answer(context, question);

    expect(entitlements.reserveCapability).toHaveBeenCalledWith(
      context,
      'FINANCE_HISTORY_QA',
      'AI_INSIGHTS',
      expect.any(String),
    );
    const calls = ai.interpret.mock.calls as unknown as Array<
      [
        {
          facts: {
            topExpenseCategories: unknown[];
            topIncomeCategories: unknown[];
            topAccounts: unknown[];
            monthlyTimeline: unknown[];
          };
        },
      ]
    >;
    const request = calls[0]?.[0];
    const { facts } = request;
    expect(facts.topExpenseCategories).toHaveLength(5);
    expect(facts.topIncomeCategories).toHaveLength(5);
    expect(facts.topAccounts).toHaveLength(5);
    expect(facts.monthlyTimeline).toHaveLength(12);
    expect(result).toEqual({
      answer: 'Generated answer',
      suggestedQuestions: ['Next question?'],
      facts: [
        { label: 'income', amount: '1000', currency: 'UAH' },
        { label: 'expenses', amount: '400', currency: 'UAH' },
        { label: 'netCashflow', amount: '600', currency: 'UAH' },
      ],
    });
  });

  it('releases a reservation when aggregate preparation fails', async () => {
    const { service, prisma, analytics, ai } = setup();
    analytics.analytics.mockRejectedValue(new Error('database unavailable'));

    await expect(service.answer(context, question)).rejects.toThrow(
      'database unavailable',
    );
    expect(prisma.aiUsageEvent.update).toHaveBeenCalledWith({
      where: { id: 'reservation-1' },
      data: { status: 'FAILED' },
    });
    expect(ai.interpret).not.toHaveBeenCalled();
  });

  it('uses account balances and recent ledger rows to explain a mismatch without writing', async () => {
    const { service, ai, proposals } = setup();

    await expect(
      service.message(context, {
        text: 'My real Card balance is 70 UAH, why is it different?',
        history: [],
      }),
    ).resolves.toEqual({
      kind: 'ANSWER',
      message: 'Expected card balance is 75 UAH.',
      recommendedScreen: null,
    });
    const routeCalls = ai.routeAssistantMessage.mock.calls as unknown as Array<
      [
        {
          facts: {
            accountBalances: Array<{ name: string; balance: string }>;
            recentTransactions: Array<{
              description: string;
              amount: string;
            }>;
          };
        },
      ]
    >;
    expect(routeCalls[0]?.[0].facts.accountBalances[0]?.name).toBe('Card');
    expect(routeCalls[0]?.[0].facts.accountBalances[0]?.balance).toBe('75');
    expect(routeCalls[0]?.[0].facts.recentTransactions[0]?.description).toBe(
      'Groceries',
    );
    expect(routeCalls[0]?.[0].facts.recentTransactions[0]?.amount).toBe('25');
    expect(proposals.createBatch).not.toHaveBeenCalled();
  });

  it('turns a concrete message into a reviewable proposal', async () => {
    const { service, ai, proposals } = setup();
    ai.routeAssistantMessage.mockResolvedValue({
      kind: 'RECORD',
      message: 'I classified this as pass-through money, not income.',
      recommendedScreen: null,
      operations: [
        {
          type: 'INCOME',
          purpose: 'PASS_THROUGH',
          amount: '300',
          economicAmount: '0',
          currency: 'UAH',
          description: 'Money for a shared gift',
          occurredAt: '2026-09-12T12:00:00.000Z',
          accountHint: 'Card',
        },
      ],
    });

    await expect(
      service.message(context, {
        text: 'My wife sent 300 PLN for the gift',
        history: [{ role: 'assistant', text: 'Which account?' }],
      }),
    ).resolves.toEqual({
      kind: 'PROPOSAL',
      message: 'I classified this as pass-through money, not income.',
      recommendedScreen: null,
      proposal: { token: 'proposal-token', operations: [] },
    });
    expect(proposals.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: { id: 'profile-1', defaultCurrency: 'UAH' },
        operations: [
          expect.objectContaining({
            purpose: 'PASS_THROUGH',
            economicAmount: '0',
          }),
        ],
      }),
    );
  });
});

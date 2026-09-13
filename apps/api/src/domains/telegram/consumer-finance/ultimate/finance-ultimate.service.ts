import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConsumerFinanceAnalytics } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceAiAnalyticsService } from '../ai/finance-ai-analytics.service';
import { FinanceAnalyticsService } from '../analytics/finance-analytics.service';
import { financeChatLocale } from '../i18n/finance-chat-i18n';
import type { FinanceUltimateQuestionDto } from '../http/finance.dto';
import type { FinanceAssistantMessageDto } from '../http/finance.dto';
import { FinanceEntitlementService } from '../billing/finance-entitlement.service';
import { AI_MODEL_POLICY } from '../../telegram-bots/core/ai-usage-cost';
import { FinanceLedgerService } from '../ledger/finance-ledger.service';
import { FinanceProposalService } from '../chat-flows/finance-proposal.service';

/** On-demand AI interpretation over the canonical bounded Analytics read model. */
@Injectable()
export class FinanceUltimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: FinanceAnalyticsService,
    private readonly ai: FinanceAiAnalyticsService,
    private readonly entitlements: FinanceEntitlementService,
    private readonly ledger?: FinanceLedgerService,
    private readonly proposals?: FinanceProposalService,
  ) {}

  async message(
    input: {
      profileId: string;
      botIntegrationId: string;
      workspaceId: string;
      telegramBotUserId: string;
    },
    dto: FinanceAssistantMessageDto,
  ) {
    const reservation = await this.entitlements.reserveCapability(
      input,
      'FINANCE_HISTORY_QA',
      'AI_INSIGHTS',
      AI_MODEL_POLICY.FINANCE_ANALYSIS,
    );
    if (!reservation)
      throw new BadRequestException('Finance AI insight quota is unavailable');
    let providerCalled = false;
    try {
      const profile = await this.prisma.financeProfile.findUnique({
        where: { id: input.profileId },
        select: {
          defaultCurrency: true,
          timezone: true,
          locale: true,
          telegramUser: { select: { languageCode: true } },
        },
      });
      if (!profile) throw new BadRequestException('Finance profile not found');
      const [analytics, accounts, recent] = await Promise.all([
        this.analytics.analytics(
          {
            id: input.profileId,
            defaultCurrency: profile.defaultCurrency,
            timezone: profile.timezone,
            workspaceId: input.workspaceId,
          },
          { period: 'CURRENT_MONTH' },
        ),
        this.requireLedger().accounts(
          input.profileId,
          profile.defaultCurrency,
          input.workspaceId,
        ),
        this.prisma.financeTransaction.findMany({
          where: { profileId: input.profileId, deletedAt: null },
          select: {
            type: true,
            purpose: true,
            amount: true,
            economicAmount: true,
            currency: true,
            necessity: true,
            occurredAt: true,
            description: true,
            account: { select: { name: true } },
            category: { select: { name: true } },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 40,
        }),
      ]);
      providerCalled = true;
      const route = await this.ai.routeAssistantMessage({
        profileId: input.profileId,
        botIntegrationId: input.botIntegrationId,
        locale: financeChatLocale(
          profile.locale,
          profile.telegramUser?.languageCode,
        ),
        text: dto.text,
        history: dto.history || [],
        facts: {
          ...compactAnalyticsFacts(analytics),
          accountBalances: accounts.slice(0, 100).map((account) => ({
            name: account.name,
            type: account.type,
            balance: account.balance,
            currency: account.currency,
            archived: Boolean(account.archivedAt),
          })),
          recentTransactions: recent.map((transaction) => ({
            type: transaction.type,
            purpose: transaction.purpose,
            amount: transaction.amount.toString(),
            economicAmount: transaction.economicAmount.toString(),
            currency: transaction.currency,
            necessity: transaction.necessity,
            occurredAt: transaction.occurredAt.toISOString(),
            description: transaction.description,
            account: transaction.account.name,
            category: transaction.category?.name || null,
          })),
        },
        reservationId: reservation.id,
      });
      if (route.kind !== 'RECORD') {
        return {
          kind: route.kind,
          message: route.message,
          recommendedScreen: route.recommendedScreen,
        };
      }
      const created = await this.requireProposals().createBatch({
        profile: {
          id: input.profileId,
          defaultCurrency: profile.defaultCurrency,
        },
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        source: 'AI',
        operations: route.operations,
      });
      const proposal = {
        token: created.token,
        operations: created.preview.map((item) => ({
          type: item.payload.type,
          amount: item.payload.amount,
          economicAmount: item.payload.economicAmount,
          purpose: item.payload.purpose,
          necessity: item.payload.necessity,
          currency: item.payload.currency,
          description: item.payload.description || '',
          occurredAt: item.payload.occurredAt,
          accountName: item.accountName,
          categoryName: item.categoryName,
        })),
      };
      return {
        kind: 'PROPOSAL' as const,
        message: route.message,
        recommendedScreen: null,
        proposal,
      };
    } catch (error) {
      if (!providerCalled)
        await this.prisma.aiUsageEvent.update({
          where: { id: reservation.id },
          data: { status: 'FAILED' },
        });
      throw error;
    }
  }

  async answer(
    input: {
      profileId: string;
      botIntegrationId: string;
      workspaceId: string;
      telegramBotUserId: string;
    },
    dto: FinanceUltimateQuestionDto,
  ) {
    const reservation = await this.entitlements.reserveCapability(
      input,
      'FINANCE_HISTORY_QA',
      'AI_INSIGHTS',
      AI_MODEL_POLICY.FINANCE_ANALYSIS,
    );
    if (!reservation) {
      throw new BadRequestException('Finance AI insight quota is unavailable');
    }
    let providerCalled = false;
    try {
      const profile = await this.prisma.financeProfile.findUnique({
        where: { id: input.profileId },
        select: {
          defaultCurrency: true,
          timezone: true,
          locale: true,
          telegramUser: { select: { languageCode: true } },
        },
      });
      if (!profile) throw new BadRequestException('Finance profile not found');
      const analytics = await this.analytics.analytics(
        {
          id: input.profileId,
          defaultCurrency: profile.defaultCurrency,
          timezone: profile.timezone,
          workspaceId: input.workspaceId,
        },
        { period: dto.period, from: dto.from, to: dto.to },
      );
      const facts = compactAnalyticsFacts(analytics);
      providerCalled = true;
      const generated = await this.ai.interpret({
        profileId: input.profileId,
        botIntegrationId: input.botIntegrationId,
        question: dto.question,
        locale: financeChatLocale(
          profile.locale,
          profile.telegramUser?.languageCode,
        ),
        facts,
        reservationId: reservation.id,
      });
      return {
        ...generated,
        facts: [
          {
            label: 'income',
            amount: analytics.summary.income,
            currency: analytics.currency,
          },
          {
            label: 'expenses',
            amount: analytics.summary.expenses,
            currency: analytics.currency,
          },
          {
            label: 'netCashflow',
            amount: analytics.summary.netCashflow,
            currency: analytics.currency,
          },
        ],
      };
    } catch (error) {
      if (reservation && !providerCalled) {
        await this.prisma.aiUsageEvent.update({
          where: { id: reservation.id },
          data: { status: 'FAILED' },
        });
      }
      throw error;
    }
  }

  private requireLedger() {
    if (!this.ledger) throw new Error('FinanceLedgerService is required');
    return this.ledger;
  }

  private requireProposals() {
    if (!this.proposals) throw new Error('FinanceProposalService is required');
    return this.proposals;
  }
}

function compactAnalyticsFacts(analytics: ConsumerFinanceAnalytics) {
  const months = new Map<
    string,
    { income: number; expenses: number; netCashflow: number }
  >();
  for (const point of analytics.timeline) {
    const key = point.date.slice(0, 7);
    const month = months.get(key) || {
      income: 0,
      expenses: 0,
      netCashflow: 0,
    };
    month.income += Number(point.income);
    month.expenses += Number(point.expenses);
    month.netCashflow += Number(point.netCashflow);
    months.set(key, month);
  }
  return {
    currency: analytics.currency,
    period: analytics.period,
    summary: analytics.summary,
    comparison: analytics.comparison,
    trends: analytics.trends,
    topExpenseCategories: analytics.expensesByCategory.slice(0, 5),
    topIncomeCategories: analytics.incomeByCategory.slice(0, 5),
    topAccounts: analytics.accounts.slice(0, 5),
    monthlyTimeline: [...months.entries()]
      .slice(-12)
      .map(([month, values]) => ({
        month,
        income: values.income.toFixed(2),
        expenses: values.expenses.toFixed(2),
        netCashflow: values.netCashflow.toFixed(2),
      })),
    excludedLegacyTransactionCount:
      analytics.legacyFallback?.transactionCount || 0,
  };
}

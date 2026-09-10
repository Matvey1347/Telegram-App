import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConsumerFinanceAnalytics } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceAiAnalyticsService } from '../ai/finance-ai-analytics.service';
import { FinanceAnalyticsService } from '../analytics/finance-analytics.service';
import { financeChatLocale } from '../i18n/finance-chat-i18n';
import type { FinanceUltimateQuestionDto } from '../http/finance.dto';
import { FinanceEntitlementService } from '../billing/finance-entitlement.service';
import { AI_MODEL_POLICY } from '../../telegram-bots/core/ai-usage-cost';

/** On-demand AI interpretation over the canonical bounded Analytics read model. */
@Injectable()
export class FinanceUltimateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: FinanceAnalyticsService,
    private readonly ai: FinanceAiAnalyticsService,
    private readonly entitlements: FinanceEntitlementService,
  ) {}

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

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  FinanceInvestmentHistoryQueryDto,
  FinanceInvestmentQueryDto,
} from './finance-investment.dto';
import {
  financeInvestmentCashFlowSelect,
  financeInvestmentCashFlowView,
  financeInvestmentSelect,
  financeInvestmentValuationSelect,
  financeInvestmentValuationView,
  financeInvestmentView,
} from './finance-investment-view';

@Injectable()
export class FinanceInvestmentReadService {
  constructor(private readonly prisma: PrismaService) {}

  async list(profileId: string, query: FinanceInvestmentQueryDto) {
    const limit = query.limit ?? 30;
    const rows = await this.prisma.financeInvestment.findMany({
      where: { profileId, ...(query.status ? { status: query.status } : {}) },
      select: financeInvestmentSelect,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(financeInvestmentView);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.id || null : null,
    };
  }

  async investment(profileId: string, id: string) {
    const row = await this.prisma.financeInvestment.findFirst({
      where: { id, profileId },
      select: financeInvestmentSelect,
    });
    if (!row) throw new NotFoundException('Investment not found');
    return financeInvestmentView(row);
  }

  async detail(profileId: string, id: string) {
    const [investment, cashFlows, valuations] = await Promise.all([
      this.investment(profileId, id),
      this.cashFlows(profileId, id, { limit: 30 }),
      this.valuations(profileId, id, { limit: 30 }),
    ]);
    return { ...investment, cashFlows, valuations };
  }

  async cashFlows(
    profileId: string,
    investmentId: string,
    query: FinanceInvestmentHistoryQueryDto,
  ) {
    await this.assertOwned(profileId, investmentId);
    const limit = query.limit ?? 30;
    const rows = await this.prisma.financeInvestmentCashFlow.findMany({
      where: { profileId, investmentId },
      select: financeInvestmentCashFlowSelect,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(financeInvestmentCashFlowView);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.id || null : null,
    };
  }

  async valuations(
    profileId: string,
    investmentId: string,
    query: FinanceInvestmentHistoryQueryDto,
  ) {
    await this.assertOwned(profileId, investmentId);
    const limit = query.limit ?? 30;
    const rows = await this.prisma.financeInvestmentValuation.findMany({
      where: { profileId, investmentId },
      select: financeInvestmentValuationSelect,
      orderBy: [{ valuedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(financeInvestmentValuationView);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1)?.id || null : null,
    };
  }

  private async assertOwned(profileId: string, id: string) {
    const row = await this.prisma.financeInvestment.findFirst({
      where: { id, profileId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Investment not found');
  }
}

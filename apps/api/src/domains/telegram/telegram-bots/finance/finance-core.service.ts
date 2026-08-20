import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CreateFinanceAccountDto,
  CreateFinanceCategoryDto,
  CreateFinanceGoalDto,
  CreateFinanceReminderDto,
  UpdateFinanceAccountDto,
  UpdateFinanceSettingsDto,
  UpsertFinanceLimitDto,
} from './finance.dto';

@Injectable()
export class FinanceCoreService {
  constructor(private readonly prisma: PrismaService) {}

  profile(id: string) {
    return this.prisma.financeProfile.findUnique({
      where: { id },
      select: {
        id: true,
        defaultCurrency: true,
        timezone: true,
        locale: true,
        onboardingCompletedAt: true,
        createdAt: true,
      },
    });
  }
  categories(profileId: string) {
    return this.prisma.financeCategory.findMany({
      where: { profileId },
      orderBy: [{ archivedAt: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    });
  }
  async limits(profileId: string) {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const [limits, spent] = await Promise.all([
      this.prisma.financeSpendingLimit.findMany({
        where: { profileId },
        include: { category: { select: { id: true, name: true } } },
      }),
      this.prisma.financeTransaction.groupBy({
        by: ['categoryId', 'currency'],
        where: {
          profileId,
          type: 'EXPENSE',
          deletedAt: null,
          occurredAt: { gte: from, lt: to },
        },
        _sum: { amount: true },
      }),
    ]);
    return limits.map((limit) => {
      const value =
        spent.find(
          (row) =>
            row.categoryId === limit.categoryId &&
            row.currency === limit.currency,
        )?._sum.amount || new Prisma.Decimal(0);
      const remaining = Prisma.Decimal.max(0, limit.amount.minus(value));
      return {
        ...limit,
        amount: limit.amount.toString(),
        spent: value.toString(),
        remaining: remaining.toString(),
        percentage: limit.amount.isZero()
          ? 0
          : Number(value.div(limit.amount).mul(100).toDecimalPlaces(2)),
      };
    });
  }
  reminders(profileId: string) {
    return this.prisma.financeReminder.findMany({
      where: { profileId },
      orderBy: { nextOccurrenceAt: 'asc' },
    });
  }
  goal(profileId: string) {
    return this.prisma.financeGoal.findFirst({
      where: { profileId, active: true },
    });
  }

  async updateSettings(profileId: string, dto: UpdateFinanceSettingsDto) {
    try {
      Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format();
    } catch {
      throw new BadRequestException('Unknown timezone');
    }
    return this.prisma.financeProfile.update({
      where: { id: profileId },
      data: {
        defaultCurrency: dto.defaultCurrency.toUpperCase(),
        timezone: dto.timezone,
        locale: dto.locale?.trim() || null,
        onboardingCompletedAt: new Date(),
      },
    });
  }

  async createAccount(profileId: string, dto: CreateFinanceAccountDto) {
    const opening = new Prisma.Decimal(dto.openingBalance || 0);
    if (!opening.isFinite())
      throw new BadRequestException('Opening balance is invalid');
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { defaultCurrency: true },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    return this.prisma.financeAccount.create({
      data: {
        profileId,
        name: dto.name.trim(),
        type: dto.type,
        currency: (dto.currency || profile.defaultCurrency).toUpperCase(),
        openingBalance: opening,
      },
    });
  }
  async updateAccount(
    profileId: string,
    id: string,
    dto: UpdateFinanceAccountDto,
  ) {
    const row = await this.prisma.financeAccount.findFirst({
      where: { id, profileId },
    });
    if (!row) throw new NotFoundException('Finance account not found');
    return this.prisma.financeAccount.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.type ? { type: dto.type } : {}),
      },
    });
  }
  async archiveAccount(profileId: string, id: string) {
    const result = await this.prisma.financeAccount.updateMany({
      where: { id, profileId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Finance account not found');
    return { archived: true };
  }

  async createCategory(profileId: string, dto: CreateFinanceCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.financeCategory.findFirst({
        where: {
          id: dto.parentId,
          profileId,
          type: dto.type,
          archivedAt: null,
        },
      });
      if (!parent) throw new NotFoundException('Parent category not found');
    }
    return this.prisma.financeCategory.create({
      data: {
        profileId,
        name: dto.name.trim(),
        type: dto.type,
        parentId: dto.parentId || null,
        key: null,
      },
    });
  }
  async archiveCategory(profileId: string, id: string) {
    const result = await this.prisma.financeCategory.updateMany({
      where: { id, profileId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!result.count)
      throw new NotFoundException('Finance category not found');
    return { archived: true };
  }

  async upsertLimit(profileId: string, dto: UpsertFinanceLimitDto) {
    const category = await this.prisma.financeCategory.findFirst({
      where: {
        id: dto.categoryId,
        profileId,
        type: 'EXPENSE',
        archivedAt: null,
      },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.isFinite() || amount.lte(0))
      throw new BadRequestException('Limit amount must be positive');
    return this.prisma.financeSpendingLimit.upsert({
      where: {
        profileId_categoryId_period: {
          profileId,
          categoryId: category.id,
          period: 'MONTH',
        },
      },
      update: { amount, currency: dto.currency.toUpperCase() },
      create: {
        profileId,
        categoryId: category.id,
        amount,
        currency: dto.currency.toUpperCase(),
      },
    });
  }

  async createGoal(profileId: string, dto: CreateFinanceGoalDto) {
    const existing = await this.prisma.financeGoal.findFirst({
      where: { profileId, active: true },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException({
        code: 'ACTIVE_GOAL_LIMIT',
        message: 'Free Finance supports one active goal',
      });
    const target = new Prisma.Decimal(dto.targetAmount);
    const current = new Prisma.Decimal(dto.currentAmount || 0);
    if (
      !target.isFinite() ||
      target.lte(0) ||
      !current.isFinite() ||
      current.lt(0)
    )
      throw new BadRequestException('Goal amounts are invalid');
    return this.prisma.financeGoal.create({
      data: {
        profileId,
        name: dto.name.trim(),
        targetAmount: target,
        currentAmount: current,
        currency: dto.currency.toUpperCase(),
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      },
    });
  }
  async deactivateGoal(profileId: string, id: string) {
    const result = await this.prisma.financeGoal.updateMany({
      where: { id, profileId, active: true },
      data: { active: false },
    });
    if (!result.count) throw new NotFoundException('Active goal not found');
    return { deleted: true };
  }

  async createReminder(profileId: string, dto: CreateFinanceReminderDto) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { timezone: true },
    });
    if (!profile) throw new NotFoundException('Finance profile not found');
    const nextOccurrenceAt = this.nextMonthly(dto.dayOfMonth, profile.timezone);
    return this.prisma.financeReminder.create({
      data: {
        profileId,
        name: dto.name.trim(),
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency.toUpperCase(),
        dayOfMonth: dto.dayOfMonth,
        reminderOffsetMinutes: dto.reminderOffsetMinutes,
        nextOccurrenceAt,
      },
    });
  }

  async export(profileId: string) {
    const [
      profile,
      accounts,
      categories,
      transactions,
      transfers,
      limits,
      reminders,
      goals,
    ] = await Promise.all([
      this.profile(profileId),
      this.prisma.financeAccount.findMany({ where: { profileId } }),
      this.categories(profileId),
      this.prisma.financeTransaction.findMany({
        where: { profileId, deletedAt: null },
      }),
      this.prisma.financeTransfer.findMany({
        where: { profileId, deletedAt: null },
      }),
      this.limits(profileId),
      this.reminders(profileId),
      this.prisma.financeGoal.findMany({ where: { profileId } }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile,
      accounts,
      categories,
      transactions,
      transfers,
      limits,
      reminders,
      goals,
    };
  }
  async deleteData(profileId: string) {
    await this.prisma.financeProfile.delete({ where: { id: profileId } });
    return { deleted: true };
  }

  private nextMonthly(day: number, timezone: string) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    let year = Number(value.year);
    let month = Number(value.month);
    if (Number(value.day) >= day) {
      month += 1;
      if (month === 13) {
        month = 1;
        year += 1;
      }
    }
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return new Date(Date.UTC(year, month - 1, Math.min(day, lastDay), 9));
  }
}

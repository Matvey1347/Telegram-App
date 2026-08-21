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
  UpdateFinanceCategoryDto,
  UpdateFinanceAccountDto,
  UpdateFinanceSettingsDto,
  UpsertFinanceLimitDto,
} from './finance.dto';
import { financeChatLocale } from './i18n/finance-chat-i18n';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { FinanceLimitService } from './finance-limit.service';

@Injectable()
export class FinanceCoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversion?: CurrencyConversionService,
  ) {}

  async profile(id: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id },
      select: {
        id: true,
        defaultCurrency: true,
        timezone: true,
        locale: true,
        onboardingCompletedAt: true,
        telegramUser: { select: { languageCode: true } },
      },
    });
    if (!profile) return null;
    const localeOverride =
      profile.locale === 'uk' ||
      profile.locale === 'ru' ||
      profile.locale === 'en'
        ? profile.locale
        : null;
    return {
      id: profile.id,
      defaultCurrency: profile.defaultCurrency,
      timezone: profile.timezone,
      locale: financeChatLocale(
        localeOverride,
        profile.telegramUser.languageCode,
      ),
      localeOverride,
      onboardingCompletedAt: profile.onboardingCompletedAt,
    };
  }
  categories(profileId: string) {
    return this.prisma.financeCategory.findMany({
      where: { profileId },
      select: {
        id: true,
        parentId: true,
        name: true,
        key: true,
        type: true,
        archivedAt: true,
      },
      orderBy: [{ archivedAt: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    });
  }
  async limits(profileId: string, categoryId?: string) {
    return new FinanceLimitService(this.prisma, this.conversion).list(
      profileId,
      categoryId,
    );
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
    await this.prisma.financeProfile.update({
      where: { id: profileId },
      data: {
        defaultCurrency: dto.defaultCurrency.toUpperCase(),
        timezone: dto.timezone,
        ...(Object.prototype.hasOwnProperty.call(dto, 'locale')
          ? { locale: dto.locale ?? null }
          : {}),
        onboardingCompletedAt: new Date(),
      },
    });
    return this.profile(profileId);
  }

  async createAccount(
    profileId: string,
    dto: CreateFinanceAccountDto,
    id?: string,
  ) {
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
        ...(id ? { id } : {}),
        profileId,
        name: dto.name.trim(),
        type: dto.type,
        currency: (dto.currency || profile.defaultCurrency).toUpperCase(),
        openingBalance: opening,
      },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        openingBalance: true,
        archivedAt: true,
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
      select: { id: true },
    });
  }
  async archiveAccount(profileId: string, id: string) {
    const account = await this.prisma.financeAccount.findFirst({
      where: { id, profileId, archivedAt: null },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Finance account not found');
    return this.prisma.financeAccount.update({
      where: { id: account.id },
      data: { archivedAt: new Date() },
      select: { id: true },
    });
  }

  async createCategory(
    profileId: string,
    dto: CreateFinanceCategoryDto,
    id?: string,
  ) {
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
        ...(id ? { id } : {}),
        profileId,
        name: dto.name.trim(),
        type: dto.type,
        parentId: dto.parentId || null,
        key: null,
      },
      select: {
        id: true,
        parentId: true,
        name: true,
        key: true,
        type: true,
        archivedAt: true,
      },
    });
  }
  async updateCategory(
    profileId: string,
    id: string,
    dto: UpdateFinanceCategoryDto,
  ) {
    const existing = await this.prisma.financeCategory.findFirst({
      where: { id, profileId },
      select: { id: true, parentId: true, name: true, key: true, type: true },
    });
    if (!existing) throw new NotFoundException('Finance category not found');
    if (dto.parentId === id)
      throw new BadRequestException('Category cannot be its own parent');
    if (dto.type !== existing.type) {
      const [transactions, limits, children, mappings] = await Promise.all([
        this.prisma.financeTransaction.count({
          where: { profileId, categoryId: id },
        }),
        this.prisma.financeSpendingLimit.count({
          where: { profileId, categoryId: id },
        }),
        this.prisma.financeCategory.count({
          where: { profileId, parentId: id },
        }),
        this.prisma.financeMerchantMapping.count({
          where: { profileId, categoryId: id },
        }),
      ]);
      if (transactions || limits || children || mappings)
        throw new ConflictException(
          'Category type cannot change while it is referenced',
        );
    }
    const parentId = Object.prototype.hasOwnProperty.call(dto, 'parentId')
      ? dto.parentId
      : existing.parentId;
    if (parentId) {
      const categories = await this.prisma.financeCategory.findMany({
        where: { profileId },
        select: { id: true, parentId: true, type: true, archivedAt: true },
      });
      const byId = new Map(
        categories.map((category) => [category.id, category]),
      );
      const parent = byId.get(parentId);
      if (!parent || parent.archivedAt || parent.type !== dto.type)
        throw new NotFoundException('Parent category not found');
      let ancestorId = parent.parentId;
      const visited = new Set<string>();
      while (ancestorId) {
        if (ancestorId === id || visited.has(ancestorId))
          throw new BadRequestException(
            'Category hierarchy cannot contain a cycle',
          );
        visited.add(ancestorId);
        ancestorId = byId.get(ancestorId)?.parentId || null;
      }
    }
    return this.prisma.financeCategory.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        type: dto.type,
        ...(existing.key && dto.name.trim() !== existing.name
          ? { key: null }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(dto, 'parentId')
          ? { parentId: dto.parentId ?? null }
          : {}),
      },
      select: {
        id: true,
        parentId: true,
        name: true,
        key: true,
        type: true,
        archivedAt: true,
      },
    });
  }
  async archiveCategory(profileId: string, id: string) {
    const category = await this.prisma.financeCategory.findFirst({
      where: { id, profileId, archivedAt: null },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Finance category not found');
    return this.prisma.financeCategory.update({
      where: { id: category.id },
      data: { archivedAt: new Date() },
      select: {
        id: true,
        parentId: true,
        name: true,
        key: true,
        type: true,
        archivedAt: true,
      },
    });
  }

  async upsertLimit(profileId: string, dto: UpsertFinanceLimitDto) {
    const category = await this.prisma.financeCategory.findFirst({
      where: {
        id: dto.categoryId,
        profileId,
        type: 'EXPENSE',
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Expense category not found');
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.isFinite() || amount.lte(0))
      throw new BadRequestException('Limit amount must be positive');
    await this.prisma.financeSpendingLimit.upsert({
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
      select: { id: true },
    });
    const [limit] = await this.limits(profileId, category.id);
    if (!limit) throw new NotFoundException('Finance limit not found');
    return limit;
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

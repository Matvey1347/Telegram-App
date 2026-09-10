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
  CreateFinanceReminderDto,
  UpdateFinanceCategoryDto,
  UpdateFinanceAccountDto,
  UpdateFinanceSettingsDto,
  UpsertFinanceLimitDto,
} from '../http/finance.dto';
import { financeChatLocale } from '../i18n/finance-chat-i18n';
import { CurrencyConversionService } from '../../../../common/currency-conversion.service';
import { FinanceLimitService } from '../planning/finance-limit.service';
import {
  financeAccountEmoji,
  financeCategoryEmoji,
  financeIconPresentation,
} from './finance-entity-emoji';
import { exportFinanceData } from './finance-portability';
import {
  archiveFinanceAccount,
  assertFinanceCategoryArchivable,
} from './finance-obligation-archive-guards';

function categoryView<
  T extends { emoji: string | null; name: string; key: string | null },
>(row: T) {
  const { emoji, ...category } = row;
  return {
    ...category,
    iconPresentation: financeIconPresentation(
      emoji,
      financeCategoryEmoji(row.name, row.key),
    ),
  };
}

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
        displayName: true,
        telegramUser: {
          select: {
            languageCode: true,
            username: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!profile) return null;
    const localeOverride =
      profile.locale === 'uk' ||
      profile.locale === 'ru' ||
      profile.locale === 'en'
        ? profile.locale
        : null;
    const telegramDisplayName =
      [profile.telegramUser.firstName, profile.telegramUser.lastName]
        .filter(Boolean)
        .join(' ') ||
      (profile.telegramUser.username
        ? `@${profile.telegramUser.username}`
        : 'Telegram user');
    const displayName = profile.displayName?.trim() || telegramDisplayName;
    return {
      id: profile.id,
      displayNameOverride: profile.displayName,
      defaultCurrency: profile.defaultCurrency,
      timezone: profile.timezone,
      locale: financeChatLocale(
        localeOverride,
        profile.telegramUser.languageCode,
      ),
      localeOverride,
      onboardingCompletedAt: profile.onboardingCompletedAt,
      telegramUser: {
        displayName,
        username: profile.telegramUser.username,
        avatarUrl: profile.telegramUser.username
          ? `https://t.me/i/userpic/320/${encodeURIComponent(profile.telegramUser.username)}.jpg`
          : null,
      },
    };
  }
  notificationTarget(profileId: string) {
    return this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: {
        botIntegrationId: true,
        botIntegration: { select: { workspaceId: true } },
        telegramUser: {
          select: {
            id: true,
            telegramChatId: true,
            runtimeInstanceId: true,
            languageCode: true,
          },
        },
      },
    });
  }
  async categories(profileId: string) {
    const categories = await this.prisma.financeCategory.findMany({
      where: { profileId },
      select: {
        id: true,
        parentId: true,
        name: true,
        emoji: true,
        key: true,
        type: true,
        archivedAt: true,
      },
      orderBy: [{ archivedAt: 'asc' }, { type: 'asc' }, { name: 'asc' }],
    });
    return categories.map(categoryView);
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
        ...(Object.prototype.hasOwnProperty.call(dto, 'displayName')
          ? { displayName: dto.displayName?.trim() || null }
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
    return this.prisma.financeAccount
      .create({
        data: {
          ...(id ? { id } : {}),
          profileId,
          name: dto.name.trim(),
          emoji: dto.emoji || null,
          type: dto.type,
          currency: (dto.currency || profile.defaultCurrency).toUpperCase(),
          openingBalance: opening,
        },
        select: {
          id: true,
          name: true,
          emoji: true,
          type: true,
          currency: true,
          openingBalance: true,
          archivedAt: true,
        },
      })
      .then((account) => {
        const { emoji, ...rest } = account;
        return {
          ...rest,
          iconPresentation: financeIconPresentation(
            emoji,
            financeAccountEmoji(account.type),
          ),
        };
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
        ...(Object.prototype.hasOwnProperty.call(dto, 'emoji')
          ? { emoji: dto.emoji || null }
          : {}),
      },
      select: { id: true },
    });
  }
  async archiveAccount(profileId: string, id: string) {
    const account = await archiveFinanceAccount(this.prisma, profileId, id);
    if (!account) throw new NotFoundException('Finance account not found');
    return account;
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
    return this.prisma.financeCategory
      .create({
        data: {
          ...(id ? { id } : {}),
          profileId,
          name: dto.name.trim(),
          emoji: dto.emoji || null,
          type: dto.type,
          parentId: dto.parentId || null,
          key: null,
        },
        select: {
          id: true,
          parentId: true,
          name: true,
          emoji: true,
          key: true,
          type: true,
          archivedAt: true,
        },
      })
      .then(categoryView);
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
    return this.prisma.financeCategory
      .update({
        where: { id },
        data: {
          name: dto.name.trim(),
          type: dto.type,
          ...(Object.prototype.hasOwnProperty.call(dto, 'emoji')
            ? { emoji: dto.emoji || null }
            : {}),
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
          emoji: true,
          key: true,
          type: true,
          archivedAt: true,
        },
      })
      .then(categoryView);
  }
  async archiveCategory(profileId: string, id: string) {
    const category = await this.prisma.financeCategory.findFirst({
      where: { id, profileId, archivedAt: null },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Finance category not found');
    await assertFinanceCategoryArchivable(this.prisma, profileId, category.id);
    return this.prisma.financeCategory
      .update({
        where: { id: category.id },
        data: { archivedAt: new Date() },
        select: {
          id: true,
          parentId: true,
          name: true,
          emoji: true,
          key: true,
          type: true,
          archivedAt: true,
        },
      })
      .then(categoryView);
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
    return exportFinanceData(this.prisma, profileId);
  }
  async deleteData(profileId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Remove obligation rows first so their RESTRICT links to generated
      // transactions cannot interfere with the profile's remaining cascades.
      await tx.financeDebt.deleteMany({ where: { profileId } });
      await tx.financeRecurringPayment.deleteMany({ where: { profileId } });
      await tx.financeSavingsMovement.deleteMany({ where: { profileId } });
      await tx.financeSavingsGoal.deleteMany({ where: { profileId } });
      await tx.financeInvestmentValuation.updateMany({
        where: { profileId },
        data: { correctsValuationId: null },
      });
      await tx.financeInvestmentValuation.deleteMany({ where: { profileId } });
      await tx.financeInvestmentCashFlow.deleteMany({ where: { profileId } });
      await tx.financeInvestment.deleteMany({ where: { profileId } });
      await tx.financeProfile.delete({ where: { id: profileId } });
    });
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

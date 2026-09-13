import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinanceRecurringPaymentRevisionKind,
  FinanceRecurringPaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  FinanceRegularPaymentInputDto,
  FinanceRegularPaymentQueryDto,
  FinanceRegularPaymentRevisionQueryDto,
} from '../finance-obligation.dto';
import {
  financeObligationProfile,
  type FinanceObligationProfile,
} from '../finance-obligation-context';
import {
  financeObligationDate,
  financeRecurrenceAnchor,
} from '../finance-obligation-date';
import {
  financeRegularPaymentRevisionSelect,
  financeRegularPaymentRevisionView,
  financeRegularPaymentSelect,
  financeRegularPaymentView,
} from '../finance-obligation-view';
import { FinanceRegularPaymentDeliveryService } from './finance-regular-payment-delivery.service';
import {
  financeRegularPaymentRevisionData,
  type FinanceRegularPaymentRow,
} from './finance-regular-payment-write';

type RegularValues = {
  name: string;
  amount: Prisma.Decimal;
  currency: string;
  accountId: string;
  categoryId: string | null;
  recurrence: FinanceRegularPaymentInputDto['recurrence'];
  anchorDay: number;
  anchorMonth: number | null;
  nextOccurrenceAt: Date;
  scheduleTimezone: string;
  note: string | null;
  necessity: NonNullable<FinanceRegularPaymentInputDto['necessity']>;
};

@Injectable()
export class FinanceRegularPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deliveries: FinanceRegularPaymentDeliveryService,
  ) {}

  async list(profileId: string, query: FinanceRegularPaymentQueryDto) {
    const limit = query.limit ?? 30;
    const [profile, rows] = await Promise.all([
      this.prisma.financeProfile.findUnique({
        where: { id: profileId },
        select: { timezone: true },
      }),
      this.prisma.financeRecurringPayment.findMany({
        where: {
          profileId,
          ...(query.id ? { id: query.id } : {}),
          ...(query.status ? { status: query.status } : {}),
        },
        select: financeRegularPaymentSelect,
        orderBy: [{ nextOccurrenceAt: 'asc' }, { id: 'asc' }],
        cursor: query.cursor ? { id: query.cursor } : undefined,
        skip: query.cursor ? 1 : 0,
        take: limit + 1,
      }),
    ]);
    if (!profile) throw new NotFoundException('Finance profile not found');
    const hasMore = rows.length > limit;
    const items = rows
      .slice(0, limit)
      .map((row) => financeRegularPaymentView(row, profile.timezone));
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  async create(profileId: string, input: FinanceRegularPaymentInputDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await financeObligationProfile(tx, profileId);
      const values = await this.values(tx, profile, input);
      const row = await tx.financeRecurringPayment.create({
        data: { profileId, ...values },
        select: financeRegularPaymentSelect,
      });
      await tx.financeRecurringPaymentRevision.create({
        data: financeRegularPaymentRevisionData(
          row,
          FinanceRecurringPaymentRevisionKind.CREATED,
        ),
      });
      const delivery = await this.deliveries.schedule(tx, profile, row);
      return {
        value: financeRegularPaymentView(row, profile.timezone),
        scheduledAt: delivery?.scheduledAt,
      };
    });
    if (result.scheduledAt) this.deliveries.notify(result.scheduledAt);
    return result.value;
  }

  async update(
    profileId: string,
    id: string,
    input: FinanceRegularPaymentInputDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeRecurringPayment.findFirst({
        where: { id, profileId },
        select: financeRegularPaymentSelect,
      });
      if (!existing)
        throw new NotFoundException('Finance regular payment not found');
      if (existing.status === FinanceRecurringPaymentStatus.CANCELED)
        throw new ConflictException('Canceled regular payment cannot change');
      const profile = await financeObligationProfile(tx, profileId);
      const values = await this.values(tx, profile, input, existing);
      if (this.same(existing, values)) {
        return {
          value: financeRegularPaymentView(existing, profile.timezone),
          scheduledAt: undefined,
          changed: false,
        };
      }
      const row = await this.claimUpdate(
        tx,
        profileId,
        existing,
        values,
        FinanceRecurringPaymentRevisionKind.UPDATED,
      );
      const delivery = await this.deliveries.replace(tx, profile, row);
      return {
        value: financeRegularPaymentView(row, profile.timezone),
        scheduledAt: delivery?.scheduledAt,
        changed: true,
      };
    });
    if (result.changed) {
      if (result.scheduledAt)
        await this.deliveries.reschedule(result.scheduledAt);
      else await this.deliveries.reschedule();
    }
    return result.value;
  }

  async changeStatus(
    profileId: string,
    id: string,
    nextStatus: FinanceRecurringPaymentStatus,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.financeRecurringPayment.findFirst({
        where: { id, profileId },
        select: financeRegularPaymentSelect,
      });
      if (!existing)
        throw new NotFoundException('Finance regular payment not found');
      if (existing.status === nextStatus) {
        const profile = await financeObligationProfile(tx, profileId);
        return {
          value: financeRegularPaymentView(existing, profile.timezone),
          scheduledAt: undefined,
          changed: false,
        };
      }
      if (existing.status === FinanceRecurringPaymentStatus.CANCELED)
        throw new ConflictException('Canceled regular payment cannot resume');
      if (
        nextStatus === FinanceRecurringPaymentStatus.PAUSED &&
        existing.status !== FinanceRecurringPaymentStatus.ACTIVE
      )
        throw new ConflictException('Only active payments can be paused');
      if (
        nextStatus === FinanceRecurringPaymentStatus.ACTIVE &&
        existing.status !== FinanceRecurringPaymentStatus.PAUSED
      )
        throw new ConflictException('Only paused payments can be resumed');
      const profile = await financeObligationProfile(tx, profileId);
      const kind =
        nextStatus === FinanceRecurringPaymentStatus.PAUSED
          ? FinanceRecurringPaymentRevisionKind.PAUSED
          : nextStatus === FinanceRecurringPaymentStatus.ACTIVE
            ? FinanceRecurringPaymentRevisionKind.RESUMED
            : FinanceRecurringPaymentRevisionKind.CANCELED;
      const row = await this.claimUpdate(
        tx,
        profileId,
        existing,
        { status: nextStatus },
        kind,
      );
      const delivery = await this.deliveries.replace(tx, profile, row);
      return {
        value: financeRegularPaymentView(row, profile.timezone),
        scheduledAt: delivery?.scheduledAt,
        changed: true,
      };
    });
    if (result.changed) {
      if (result.scheduledAt)
        await this.deliveries.reschedule(result.scheduledAt);
      else await this.deliveries.reschedule();
    }
    return result.value;
  }

  async revisions(
    profileId: string,
    id: string,
    query: FinanceRegularPaymentRevisionQueryDto,
  ) {
    const limit = query.limit ?? 30;
    const owner = await this.prisma.financeRecurringPayment.findFirst({
      where: { id, profileId },
      select: { id: true },
    });
    if (!owner)
      throw new NotFoundException('Finance regular payment not found');
    const rows = await this.prisma.financeRecurringPaymentRevision.findMany({
      where: { recurringPaymentId: id },
      select: financeRegularPaymentRevisionSelect,
      orderBy: [{ version: 'desc' }, { id: 'desc' }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(financeRegularPaymentRevisionView);
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  private async values(
    tx: Prisma.TransactionClient,
    profile: FinanceObligationProfile,
    input: FinanceRegularPaymentInputDto,
    existing?: FinanceRegularPaymentRow,
  ): Promise<RegularValues> {
    const name = input.name.trim();
    if (!name)
      throw new BadRequestException('Regular payment name is required');
    const amount = new Prisma.Decimal(input.amount);
    if (!amount.isFinite() || !amount.isPositive())
      throw new BadRequestException('Regular payment amount must be positive');
    const [account, category] = await Promise.all([
      tx.financeAccount.findFirst({
        where: {
          id: input.accountId,
          profileId: profile.id,
          ...(existing?.accountId === input.accountId
            ? {}
            : { archivedAt: null }),
        },
        select: { id: true, currency: true },
      }),
      input.categoryId
        ? tx.financeCategory.findFirst({
            where: {
              id: input.categoryId,
              profileId: profile.id,
              type: 'EXPENSE',
              ...(existing?.categoryId === input.categoryId
                ? {}
                : { archivedAt: null }),
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!account) throw new NotFoundException('Finance account not found');
    if (input.categoryId && !category)
      throw new NotFoundException('Finance expense category not found');
    const nextOccurrenceAt = financeObligationDate(
      input.nextPaymentDate,
      profile.timezone,
    );
    return {
      name,
      amount,
      currency: account.currency,
      accountId: account.id,
      categoryId: category?.id ?? null,
      recurrence: input.recurrence,
      ...financeRecurrenceAnchor(input.nextPaymentDate, input.recurrence),
      nextOccurrenceAt,
      scheduleTimezone: profile.timezone,
      note: input.note?.trim() || null,
      necessity: input.necessity ?? 'UNSPECIFIED',
    };
  }

  private async claimUpdate(
    tx: Prisma.TransactionClient,
    profileId: string,
    existing: FinanceRegularPaymentRow,
    data: Prisma.FinanceRecurringPaymentUpdateManyMutationInput,
    kind: FinanceRecurringPaymentRevisionKind,
  ) {
    const claimed = await tx.financeRecurringPayment.updateMany({
      where: { id: existing.id, profileId, version: existing.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (claimed.count !== 1)
      throw new ConflictException('Regular payment changed concurrently');
    const row = await tx.financeRecurringPayment.findUniqueOrThrow({
      where: { id: existing.id },
      select: financeRegularPaymentSelect,
    });
    await tx.financeRecurringPaymentRevision.create({
      data: financeRegularPaymentRevisionData(row, kind),
    });
    return row;
  }

  private same(existing: FinanceRegularPaymentRow, values: RegularValues) {
    return (
      existing.name === values.name &&
      existing.amount.equals(values.amount) &&
      existing.currency === values.currency &&
      existing.accountId === values.accountId &&
      existing.categoryId === values.categoryId &&
      existing.recurrence === values.recurrence &&
      existing.anchorDay === values.anchorDay &&
      existing.anchorMonth === values.anchorMonth &&
      existing.nextOccurrenceAt.getTime() ===
        values.nextOccurrenceAt.getTime() &&
      existing.scheduleTimezone === values.scheduleTimezone &&
      existing.note === values.note &&
      (existing.necessity ?? 'UNSPECIFIED') === values.necessity
    );
  }
}

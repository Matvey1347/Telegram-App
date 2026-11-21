import {
  instagramIdentity,
  mapLegacyContactMethod,
} from '../telegram-crm/telegram-crm-instagram-identity.service';
import { NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
  TelegramCrmContactStage,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  legacyAdvertiserLifecycleStage,
  legacyAdvertiserStatus,
} from '../telegram-crm/telegram-crm-legacy-compatibility';
import { syncLegacyCrmPeer } from '../telegram-crm/telegram-crm-legacy-peer';
import { telegramAdvertiserInclude } from './telegram-ad-sales-advertiser-read-model';
import { CreateTelegramAdSaleDto, UpdateTelegramAdSaleDto } from './dto';
import { decimal, decimalToString } from './domain/decimal';
import { syncPurchasedCrmTags } from '../telegram-crm/telegram-crm-system-tags.service';
import { findCanonicalAdvertiser } from '../telegram-crm/telegram-advertiser-identity-resolver';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export function normalizeTelegramUsername(_operations: unknown, value?: string | null) {
  const normalized = value?.trim().replace(/^@+/, '').toLowerCase() || '';
  return normalized || null;
}

export function normalizePhone(_operations: unknown, value?: string | null) {
  const normalized = value?.trim().replace(/[^\d+]/g, '') || '';
  return normalized || null;
}

export function normalizeEmail(_operations: unknown, value?: string | null) {
  const normalized = value?.trim().toLowerCase() || '';
  return normalized || null;
}

export function normalizeWebsite(_operations: unknown, value?: string | null) {
  const normalized = value?.trim().toLowerCase() || '';
  return normalized || null;
}

export function normalizeContactValue(
  operations: Pick<
    TelegramAdSalesOperations,
    'normalizeEmail' | 'normalizePhone' | 'normalizeTelegramUsername' | 'normalizeWebsite'
  >,
  type: TelegramAdvertiserContactType,
  value?: string | null,
) {
  if (type === TelegramAdvertiserContactType.TELEGRAM_USERNAME) {
    return operations.normalizeTelegramUsername(value);
  }
  if (type === TelegramAdvertiserContactType.PHONE) {
    return operations.normalizePhone(value);
  }
  if (type === TelegramAdvertiserContactType.EMAIL) {
    return operations.normalizeEmail(value);
  }
  if (type === TelegramAdvertiserContactType.WEBSITE) {
    return operations.normalizeWebsite(value);
  }
  if (type === TelegramAdvertiserContactType.INSTAGRAM) return instagramIdentity(value ?? '').username;
  return value?.trim() || null;
}

export function mapAdvertiserContact(_operations: unknown, contact: any) {
  return mapLegacyContactMethod(contact as Parameters<typeof mapLegacyContactMethod>[0]);
}

export function mapAdvertiserActivity(_operations: unknown, activity: any) {
  return {
    ...activity,
    occurredAt: activity.occurredAt.toISOString(),
    createdAt: activity.createdAt.toISOString(),
  };
}

export function mapAdvertiserTask(_operations: unknown, task: any) {
  return {
    ...task,
    dueAt: task.dueAt.toISOString(),
    remindAt: task.remindAt?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    skippedAt: task.skippedAt?.toISOString() ?? null,
    snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function mapAdvertiser(
  operations: Pick<
    TelegramAdSalesOperations,
    'mapAdvertiserActivity' | 'mapAdvertiserContact' | 'mapAdvertiserTask' | 'mapSale'
  >,
  settings: any,
) {
  const { stage, crmPeers, _count, ...legacySettings } = settings;
  const hasActiveDeal = Number(_count?.sales ?? 0) > 0;
  return {
    ...legacySettings,
    telegramUserId: crmPeers?.[0]?.telegramUserId ?? null,
    photoUrl: crmPeers?.[0]?.photoUrl ?? null,
    status: legacyAdvertiserStatus(stage, hasActiveDeal),
    lifecycleStage: legacyAdvertiserLifecycleStage(stage),
    totalRevenueInPrimaryCurrency: decimalToString(settings.totalRevenueInPrimaryCurrency),
    averageOrderValueInPrimaryCurrency: decimalToString(settings.averageOrderValueInPrimaryCurrency),
    lastContactAt: settings.lastContactAt?.toISOString() ?? null,
    lastPurchaseAt: settings.lastPurchaseAt?.toISOString() ?? null,
    nextContactAt: settings.nextContactAt?.toISOString() ?? null,
    firstPurchaseAt: settings.firstPurchaseAt?.toISOString() ?? null,
    repeatCustomerAt: settings.repeatCustomerAt?.toISOString() ?? null,
    archivedAt: settings.archivedAt?.toISOString() ?? null,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
    contacts: Array.isArray(settings.contacts)
      ? settings.contacts.map((contact: any) => operations.mapAdvertiserContact(contact))
      : undefined,
    recentActivities: Array.isArray(settings.activities)
      ? settings.activities.map((activity: any) => operations.mapAdvertiserActivity(activity))
      : undefined,
    openTasks: Array.isArray(settings.tasks)
      ? settings.tasks.map((task: any) => operations.mapAdvertiserTask(task))
      : undefined,
    sales: Array.isArray(settings.sales)
      ? settings.sales.map((sale: any) => operations.mapSale(sale))
      : undefined,
  };
}

export function advertiserInclude(operations: Pick<TelegramAdSalesOperations, 'includeSaleRelations'>) {
  return telegramAdvertiserInclude(operations.includeSaleRelations());
}

export async function getAdvertiser(
  operations: Pick<TelegramAdSalesOperations, 'advertiserInclude' | 'prisma'>,
  workspaceId: string,
  advertiserId: string,
) {
  const advertiser = await operations.prisma.telegramAdvertiser.findFirst({
    where: { id: advertiserId, workspaceId },
    include: operations.advertiserInclude(),
  });
  if (!advertiser) throw new NotFoundException('Telegram advertiser not found');
  return advertiser;
}

export async function createAdvertiserActivity(
  operations: Pick<TelegramAdSalesOperations, 'prisma'>,
  workspaceId: string,
  advertiserId: string,
  payload: {
    type: TelegramAdvertiserActivityType;
    title: string;
    description?: string | null;
    saleId?: string | null;
    placementId?: string | null;
    taskId?: string | null;
    actorUserId?: string | null;
    actorMemberId?: string | null;
    metadata?: Prisma.InputJsonValue | null;
    occurredAt?: Date;
  },
) {
  return operations.prisma.telegramAdvertiserActivity.create({
    data: {
      workspaceId,
      advertiserId,
      saleId: payload.saleId ?? null,
      placementId: payload.placementId ?? null,
      taskId: payload.taskId ?? null,
      actorUserId: payload.actorUserId ?? null,
      actorMemberId: payload.actorMemberId ?? null,
      type: payload.type,
      title: payload.title,
      description: payload.description ?? null,
      metadata: payload.metadata ?? Prisma.JsonNull,
      occurredAt: payload.occurredAt ?? new Date(),
    },
  });
}

export async function recalculateAdvertiserStats(
  operations: Pick<TelegramAdSalesOperations, 'prisma' | 'purchaseFolderSync'>,
  workspaceId: string,
  advertiserId: string,
  tx: Prisma.TransactionClient | PrismaService = this.prisma,
) {
  const sales = await tx.telegramAdSale.findMany({
    where: {
      workspaceId,
      advertiserId,
      status: { not: TelegramAdSaleStatus.CANCELLED },
    },
    include: {
      placements: true,
      payments: {
        where: { status: { not: TelegramAdSalePaymentStatus.VOIDED } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  const totalSalesCount = sales.length;
  const completedSales = sales.filter(
    (sale) =>
      sale.status === TelegramAdSaleStatus.CONFIRMED ||
      sale.status === TelegramAdSaleStatus.IN_PROGRESS ||
      sale.status === TelegramAdSaleStatus.COMPLETED,
  );
  const completedSalesCount = completedSales.length;
  const customerSales = sales.filter((sale) => {
    if (completedSales.includes(sale)) return true;
    const agreedTotal = sale.placements.reduce(
      (sum, placement) => sum.add(decimal(placement.agreedPrice ?? 0)),
      decimal(0),
    );
    const paidTotal = sale.payments.reduce((sum, payment) => sum.add(decimal(payment.amount)), decimal(0));
    return agreedTotal.greaterThan(0) && paidTotal.greaterThanOrEqualTo(agreedTotal);
  });
  const totalPlacementsCount = sales.reduce((sum, sale) => sum + sale.placements.length, 0);
  const totalRevenue = sales.reduce(
    (sum, sale) =>
      sum.add(
        sale.payments.reduce(
          (paymentSum, payment) => paymentSum.add(payment.amountInPrimaryCurrency),
          decimal(0),
        ),
      ),
    decimal(0),
  );
  const averageOrderValue = totalSalesCount ? totalRevenue.div(totalSalesCount) : decimal(0);
  const purchaseDates = customerSales.map((sale) => sale.createdAt).sort((a, b) => a.getTime() - b.getTime());
  const firstPurchaseAt = purchaseDates[0] ?? null;
  const lastPurchaseAt = purchaseDates[purchaseDates.length - 1] ?? null;
  const repeatCustomerAt = purchaseDates[1] ?? null;
  await tx.telegramAdvertiser.update({
    where: { id: advertiserId },
    data: {
      totalSalesCount,
      completedSalesCount,
      totalPlacementsCount,
      totalRevenueInPrimaryCurrency: totalRevenue,
      averageOrderValueInPrimaryCurrency: averageOrderValue,
      firstPurchaseAt,
      lastPurchaseAt,
      repeatCustomerAt,
    },
  });
  await syncPurchasedCrmTags(tx, workspaceId, advertiserId);
  if (tx === operations.prisma) {
    await operations.purchaseFolderSync?.sync(workspaceId, advertiserId);
  }
}

export async function resolveAdvertiserForSale(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'createAdvertiserActivity'
    | 'getAdvertiser'
    | 'linkAdvertiserToMatchingCrmPeer'
    | 'normalizeEmail'
    | 'normalizePhone'
    | 'normalizeTelegramUsername'
    | 'prisma'
  >,
  workspaceId: string,
  userId: string,
  dto: CreateTelegramAdSaleDto | UpdateTelegramAdSaleDto,
  assignedMemberId?: string | null,
) {
  if (dto.advertiserId) {
    return operations.getAdvertiser(workspaceId, dto.advertiserId);
  }
  const shouldCreate = 'createAdvertiser' in dto ? dto.createAdvertiser : false;
  if (!shouldCreate) return null;
  const existing = await findCanonicalAdvertiser(operations.prisma.telegramAdvertiser, {
    workspaceId,
    username: operations.normalizeTelegramUsername(dto.advertiserTelegram),
    phone: operations.normalizePhone(dto.advertiserContact),
    email: operations.normalizeEmail(dto.advertiserContact),
    displayName: dto.advertiserName,
  });
  if (existing) {
    await operations.linkAdvertiserToMatchingCrmPeer(
      workspaceId,
      existing.id,
      operations.normalizeTelegramUsername(dto.advertiserTelegram),
    );
    return operations.getAdvertiser(workspaceId, existing.id);
  }
  const created = await operations.prisma.telegramAdvertiser.create({
    data: {
      workspaceId,
      displayName: (dto.advertiserName ?? 'Advertiser').trim(),
      companyName: dto.advertiserCompanyName?.trim() || null,
      telegramUsername: operations.normalizeTelegramUsername(dto.advertiserTelegram),
      phone: operations.normalizePhone(dto.advertiserContact),
      email: operations.normalizeEmail(dto.advertiserContact),
      ownerMemberId: assignedMemberId ?? null,
      createdByUserId: userId,
      stage: TelegramCrmContactStage.NEW,
    },
  });
  await operations.linkAdvertiserToMatchingCrmPeer(workspaceId, created.id, created.telegramUsername);
  if (dto.advertiserTelegram?.trim()) {
    await operations.prisma.telegramAdvertiserContact.create({
      data: {
        workspaceId,
        advertiserId: created.id,
        type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
        value: dto.advertiserTelegram.trim(),
        normalizedValue: operations.normalizeTelegramUsername(dto.advertiserTelegram)!,
        isPrimary: true,
      },
    });
  }
  if (dto.advertiserContact?.trim()) {
    const normalizedEmail = operations.normalizeEmail(dto.advertiserContact);
    const normalizedPhone = operations.normalizePhone(dto.advertiserContact);
    const type = normalizedEmail?.includes('@')
      ? TelegramAdvertiserContactType.EMAIL
      : TelegramAdvertiserContactType.PHONE;
    await operations.prisma.telegramAdvertiserContact.create({
      data: {
        workspaceId,
        advertiserId: created.id,
        type,
        value: dto.advertiserContact.trim(),
        normalizedValue:
          (type === TelegramAdvertiserContactType.EMAIL ? normalizedEmail : normalizedPhone) ??
          dto.advertiserContact.trim(),
        isPrimary: !dto.advertiserTelegram?.trim(),
      },
    });
  }
  await operations.createAdvertiserActivity(workspaceId, created.id, {
    type: TelegramAdvertiserActivityType.ADVERTISER_CREATED,
    title: 'Advertiser created from ad sale',
    actorUserId: userId,
  });
  return operations.getAdvertiser(workspaceId, created.id);
}

export async function linkAdvertiserToMatchingCrmPeer(
  operations: Pick<TelegramAdSalesOperations, 'prisma'>,
  workspaceId: string,
  advertiserId: string,
  username: string | null | undefined,
) {
  if (!username) return;
  const peer = await operations.prisma.telegramCrmPeer.findFirst({
    where: { workspaceId, username, contactId: null },
    select: { telegramUserId: true },
  });
  if (!peer) return;
  await operations.prisma.$transaction((tx) =>
    syncLegacyCrmPeer(tx, {
      workspaceId,
      contactId: advertiserId,
      telegramUserId: peer.telegramUserId,
      telegramUserIdSpecified: true,
      username,
      usernameSpecified: true,
    }),
  );
}

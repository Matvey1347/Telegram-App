import { addCrmContactMethod, updateCrmContactMethod } from './telegram-ad-sales-crm-contact-methods';
import { Prisma, TelegramAdvertiserActivityType, TelegramCrmContactStage } from '@prisma/client';
import { createPaginatedResponse, normalizePagination } from '../../../common/pagination/pagination.utils';
import {
  legacyAdvertiserFilter,
  stageFromLegacyAdvertiser,
} from '../telegram-crm/telegram-crm-legacy-compatibility';
import { syncLegacyCrmPeer } from '../telegram-crm/telegram-crm-legacy-peer';
import { telegramAdvertiserCompatibilityInclude } from './telegram-ad-sales-advertiser-read-model';
import {
  CreateTelegramAdvertiserActivityDto,
  CreateTelegramAdvertiserContactDto,
  CreateTelegramAdvertiserDto,
  TelegramAdvertiserActivitiesQueryDto,
  TelegramAdvertiserSearchDto,
  TelegramAdvertisersQueryDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
} from './dto';
import { findCanonicalAdvertiser } from '../telegram-crm/telegram-advertiser-identity-resolver';
import type { TelegramAdSalesOperations } from './telegram-ad-sales.service';

export async function listAdvertisers(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'advertiserInclude'
    | 'mapAdvertiser'
    | 'normalizeEmail'
    | 'normalizePhone'
    | 'normalizeTelegramUsername'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  query: TelegramAdvertisersQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  const pagination = normalizePagination(query);
  const search = query.search?.trim();
  const where: Prisma.TelegramAdvertiserWhereInput = {
    workspaceId,
    ...(query.archived ? {} : { archivedAt: null }),
    ...legacyAdvertiserFilter(query),
    ...(query.ownerMemberId ? { ownerMemberId: query.ownerMemberId } : {}),
    ...(search
      ? {
          OR: [
            { displayName: { contains: search, mode: 'insensitive' } },
            { companyName: { contains: search, mode: 'insensitive' } },
            {
              telegramUsername: {
                contains: operations.normalizeTelegramUsername(search) ?? search,
                mode: 'insensitive',
              },
            },
            {
              phone: {
                contains: operations.normalizePhone(search) ?? search,
                mode: 'insensitive',
              },
            },
            {
              email: {
                contains: operations.normalizeEmail(search) ?? search,
                mode: 'insensitive',
              },
            },
            {
              contacts: {
                some: {
                  normalizedValue: {
                    contains: search.toLowerCase(),
                    mode: 'insensitive',
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [items, totalItems] = await operations.prisma.$transaction([
    operations.prisma.telegramAdvertiser.findMany({
      where,
      include: operations.advertiserInclude(),
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    operations.prisma.telegramAdvertiser.count({ where }),
  ]);
  return createPaginatedResponse(
    items.map((item) => operations.mapAdvertiser(item)),
    totalItems,
    pagination,
  );
}

export async function advertiserSearch(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'mapAdvertiser'
    | 'normalizeEmail'
    | 'normalizePhone'
    | 'normalizeTelegramUsername'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  query: TelegramAdvertiserSearchDto,
  ownerMemberId?: string,
) {
  const workspaceId = await operations.workspace(userId);
  const search = query.q.trim();
  const normalizedVariants = [
    search.toLowerCase(),
    operations.normalizeTelegramUsername(search),
    operations.normalizePhone(search),
    operations.normalizeEmail(search),
  ].filter(Boolean) as string[];
  const items = await operations.prisma.telegramAdvertiser.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      ...(ownerMemberId ? { ownerMemberId } : {}),
      OR: [
        { displayName: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        ...normalizedVariants.map((value) => ({
          telegramUsername: { contains: value, mode: 'insensitive' as const },
        })),
        ...normalizedVariants.map((value) => ({
          phone: { contains: value, mode: 'insensitive' as const },
        })),
        ...normalizedVariants.map((value) => ({
          email: { contains: value, mode: 'insensitive' as const },
        })),
        ...normalizedVariants.map((value) => ({
          contacts: {
            some: {
              normalizedValue: {
                contains: value,
                mode: 'insensitive' as const,
              },
            },
          },
        })),
      ],
    },
    include: telegramAdvertiserCompatibilityInclude,
    orderBy: [{ totalRevenueInPrimaryCurrency: 'desc' }, { updatedAt: 'desc' }],
    take: Math.max(1, Math.min(20, query.limit ?? 10)),
  });
  return items.map((item) => operations.mapAdvertiser(item));
}

export async function getAdvertiserDetails(
  operations: Pick<TelegramAdSalesOperations, 'getAdvertiser' | 'mapAdvertiser' | 'workspace'>,
  userId: string,
  advertiserId: string,
) {
  const workspaceId = await operations.workspace(userId);
  return operations.mapAdvertiser(await operations.getAdvertiser(workspaceId, advertiserId));
}

export async function createAdvertiser(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'advertiserInclude'
    | 'createAdvertiserActivity'
    | 'mapAdvertiser'
    | 'normalizeEmail'
    | 'normalizePhone'
    | 'normalizeTelegramUsername'
    | 'normalizeWebsite'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  dto: CreateTelegramAdvertiserDto,
) {
  const workspaceId = await operations.workspace(userId);
  let createdNew = false;
  const advertiser = await operations.prisma.$transaction(async (tx) => {
    const telegramUsername = operations.normalizeTelegramUsername(dto.telegramUsername);
    const existing = await findCanonicalAdvertiser(tx.telegramAdvertiser, {
      workspaceId,
      username: telegramUsername,
      phone: operations.normalizePhone(dto.phone),
      email: operations.normalizeEmail(dto.email),
      displayName: dto.displayName,
    });
    if (existing) {
      return tx.telegramAdvertiser.findUniqueOrThrow({
        where: { id: existing.id },
        include: operations.advertiserInclude(),
      });
    }
    const created = await tx.telegramAdvertiser.create({
      data: {
        workspaceId,
        displayName: dto.displayName.trim(),
        companyName: dto.companyName?.trim() || null,
        telegramUsername,
        phone: operations.normalizePhone(dto.phone),
        email: operations.normalizeEmail(dto.email),
        website: operations.normalizeWebsite(dto.website),
        description: dto.description?.trim() || null,
        source: dto.source?.trim() || null,
        stage: stageFromLegacyAdvertiser(dto) ?? TelegramCrmContactStage.NEW,
        archivedAt: stageFromLegacyAdvertiser(dto) === TelegramCrmContactStage.ANOTHER ? new Date() : null,
        ownerMemberId: dto.ownerMemberId ?? null,
        createdByUserId: userId,
        nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : null,
        defaultFollowUpDays: dto.defaultFollowUpDays ?? null,
        preferredCurrency: dto.preferredCurrency ?? null,
        preferredContactMethod: dto.preferredContactMethod ?? null,
      },
    });
    await syncLegacyCrmPeer(tx, {
      workspaceId,
      contactId: created.id,
      telegramUserId: dto.telegramUserId,
      telegramUserIdSpecified: Boolean(dto.telegramUserId?.trim()),
      username: dto.telegramUsername,
      usernameSpecified: dto.telegramUsername !== undefined,
    });
    createdNew = true;
    return tx.telegramAdvertiser.findUniqueOrThrow({
      where: { id: created.id },
      include: operations.advertiserInclude(),
    });
  });
  if (createdNew) {
    await operations.createAdvertiserActivity(workspaceId, advertiser.id, {
      type: TelegramAdvertiserActivityType.ADVERTISER_CREATED,
      title: 'Advertiser created',
      actorUserId: userId,
    });
  }
  return operations.mapAdvertiser(advertiser);
}

export async function updateAdvertiser(
  operations: Pick<
    TelegramAdSalesOperations,
    | 'advertiserInclude'
    | 'getAdvertiser'
    | 'mapAdvertiser'
    | 'normalizeEmail'
    | 'normalizePhone'
    | 'normalizeTelegramUsername'
    | 'normalizeWebsite'
    | 'notificationProjector'
    | 'prisma'
    | 'workspace'
  >,
  userId: string,
  advertiserId: string,
  dto: UpdateTelegramAdvertiserDto,
) {
  const workspaceId = await operations.workspace(userId);
  const existing = await operations.getAdvertiser(workspaceId, advertiserId);
  const stage = stageFromLegacyAdvertiser(dto);
  let invalidatedMemberIds: string[] = [];
  const advertiser = await operations.prisma.$transaction(async (tx) => {
    await tx.telegramAdvertiser.update({
      where: { id: advertiserId },
      data: {
        ...(dto.displayName === undefined ? {} : { displayName: dto.displayName.trim() }),
        ...(dto.companyName === undefined ? {} : { companyName: dto.companyName?.trim() || null }),
        ...(dto.telegramUsername === undefined
          ? {}
          : {
              telegramUsername: operations.normalizeTelegramUsername(dto.telegramUsername),
            }),
        ...(dto.phone === undefined ? {} : { phone: operations.normalizePhone(dto.phone) }),
        ...(dto.email === undefined ? {} : { email: operations.normalizeEmail(dto.email) }),
        ...(dto.website === undefined ? {} : { website: operations.normalizeWebsite(dto.website) }),
        ...(dto.description === undefined ? {} : { description: dto.description?.trim() || null }),
        ...(dto.source === undefined ? {} : { source: dto.source?.trim() || null }),
        ...(stage === undefined
          ? {}
          : {
              stage,
              archivedAt: stage === TelegramCrmContactStage.ANOTHER ? new Date() : null,
            }),
        ...(dto.ownerMemberId === undefined ? {} : { ownerMemberId: dto.ownerMemberId }),
        ...(dto.nextContactAt === undefined
          ? {}
          : {
              nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : null,
            }),
        ...(dto.defaultFollowUpDays === undefined ? {} : { defaultFollowUpDays: dto.defaultFollowUpDays }),
        ...(dto.preferredCurrency === undefined ? {} : { preferredCurrency: dto.preferredCurrency }),
        ...(dto.preferredContactMethod === undefined
          ? {}
          : { preferredContactMethod: dto.preferredContactMethod }),
      },
    });
    await syncLegacyCrmPeer(tx, {
      workspaceId,
      contactId: advertiserId,
      telegramUserId: dto.telegramUserId,
      telegramUserIdSpecified: dto.telegramUserId !== undefined,
      username: dto.telegramUsername,
      usernameSpecified: dto.telegramUsername !== undefined,
    });
    if (
      dto.ownerMemberId !== undefined &&
      dto.ownerMemberId !== existing.ownerMemberId &&
      operations.notificationProjector
    ) {
      invalidatedMemberIds = await operations.notificationProjector.contactVisibilityChanged(
        tx,
        workspaceId,
        advertiserId,
      );
    }
    return tx.telegramAdvertiser.findUniqueOrThrow({
      where: { id: advertiserId },
      include: operations.advertiserInclude(),
    });
  });
  if (invalidatedMemberIds.length) {
    operations.notificationProjector?.invalidateVisibility(workspaceId, invalidatedMemberIds);
  }
  return operations.mapAdvertiser(advertiser);
}

export async function archiveAdvertiser(
  operations: Pick<
    TelegramAdSalesOperations,
    'advertiserInclude' | 'getAdvertiser' | 'mapAdvertiser' | 'prisma' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  const advertiser = await operations.prisma.telegramAdvertiser.update({
    where: { id: advertiserId },
    data: {
      archivedAt: new Date(),
      stage: TelegramCrmContactStage.ANOTHER,
    },
    include: operations.advertiserInclude(),
  });
  return operations.mapAdvertiser(advertiser);
}

export async function restoreAdvertiser(
  operations: Pick<
    TelegramAdSalesOperations,
    'advertiserInclude' | 'getAdvertiser' | 'mapAdvertiser' | 'prisma' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  const advertiser = await operations.prisma.telegramAdvertiser.update({
    where: { id: advertiserId },
    data: { archivedAt: null, stage: TelegramCrmContactStage.LEAD },
    include: operations.advertiserInclude(),
  });
  return operations.mapAdvertiser(advertiser);
}

export async function addAdvertiserContact(
  operations: Pick<
    TelegramAdSalesOperations,
    'crmAuthorization' | 'getAdvertiser' | 'normalizeContactValue' | 'prisma' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
  dto: CreateTelegramAdvertiserContactDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  return addCrmContactMethod(
    {
      prisma: operations.prisma,
      workspaceId,
      advertiserId,
      userId,
      authorize: () => operations.crmAuthorization?.requireEditContact(userId, advertiserId),
      normalize: (type, value) => operations.normalizeContactValue(type, value),
    },
    dto,
  );
}

export async function updateAdvertiserContact(
  operations: Pick<
    TelegramAdSalesOperations,
    'crmAuthorization' | 'getAdvertiser' | 'normalizeContactValue' | 'prisma' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
  contactId: string,
  dto: UpdateTelegramAdvertiserContactDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  return updateCrmContactMethod(
    {
      prisma: operations.prisma,
      workspaceId,
      advertiserId,
      userId,
      authorize: () => operations.crmAuthorization?.requireEditContact(userId, advertiserId),
      normalize: (type, value) => operations.normalizeContactValue(type, value),
    },
    contactId,
    dto,
  );
}

export async function deleteAdvertiserContact(
  operations: Pick<TelegramAdSalesOperations, 'getAdvertiser' | 'prisma' | 'workspace'>,
  userId: string,
  advertiserId: string,
  contactId: string,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  await operations.prisma.telegramAdvertiserContact.deleteMany({
    where: { id: contactId, workspaceId, advertiserId },
  });
  return { success: true };
}

export async function setPrimaryAdvertiserContact(
  operations: Pick<
    TelegramAdSalesOperations,
    'getAdvertiser' | 'mapAdvertiserContact' | 'prisma' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
  contactId: string,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  const [_, contact] = await operations.prisma.$transaction([
    operations.prisma.telegramAdvertiserContact.updateMany({
      where: { workspaceId, advertiserId },
      data: { isPrimary: false },
    }),
    operations.prisma.telegramAdvertiserContact.update({
      where: { id: contactId },
      data: { isPrimary: true },
    }),
  ]);
  return operations.mapAdvertiserContact(contact);
}

export async function listAdvertiserActivities(
  operations: Pick<
    TelegramAdSalesOperations,
    'getAdvertiser' | 'mapAdvertiserActivity' | 'prisma' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
  query: TelegramAdvertiserActivitiesQueryDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  const pagination = normalizePagination(query);
  const [items, totalItems] = await operations.prisma.$transaction([
    operations.prisma.telegramAdvertiserActivity.findMany({
      where: { workspaceId, advertiserId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    operations.prisma.telegramAdvertiserActivity.count({
      where: { workspaceId, advertiserId },
    }),
  ]);
  return createPaginatedResponse(
    items.map((item) => operations.mapAdvertiserActivity(item)),
    totalItems,
    pagination,
  );
}

export async function createAdvertiserActivityEntry(
  operations: Pick<
    TelegramAdSalesOperations,
    'createAdvertiserActivity' | 'getAdvertiser' | 'mapAdvertiserActivity' | 'workspace'
  >,
  userId: string,
  advertiserId: string,
  dto: CreateTelegramAdvertiserActivityDto,
) {
  const workspaceId = await operations.workspace(userId);
  await operations.getAdvertiser(workspaceId, advertiserId);
  const activity = await operations.createAdvertiserActivity(workspaceId, advertiserId, {
    type: dto.type,
    title: dto.title.trim(),
    description: dto.description?.trim() || null,
    actorUserId: userId,
    metadata: (dto.metadata as Prisma.InputJsonValue | undefined) ?? null,
    occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
  });
  return operations.mapAdvertiserActivity(activity);
}

export async function createAdvertiserNote(
  operations: Pick<TelegramAdSalesOperations, 'createAdvertiserActivityEntry'>,
  userId: string,
  advertiserId: string,
  dto: CreateTelegramAdvertiserActivityDto,
) {
  return operations.createAdvertiserActivityEntry(userId, advertiserId, {
    ...dto,
    type: TelegramAdvertiserActivityType.NOTE_ADDED,
  });
}

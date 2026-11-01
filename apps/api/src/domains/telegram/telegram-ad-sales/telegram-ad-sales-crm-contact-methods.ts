import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, type TelegramAdvertiserContactType } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  instagramContactConflict,
  mapLegacyContactMethod,
} from '../telegram-crm/telegram-crm-instagram-identity.service';
import type {
  CreateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserContactDto,
} from './dto';
type Context = {
  prisma: PrismaService;
  workspaceId: string;
  advertiserId: string;
  userId: string;
  authorize?: () => Promise<unknown> | undefined;
  normalize: (
    type: TelegramAdvertiserContactType,
    value: string,
  ) => string | null;
};
export async function addCrmContactMethod(
  context: Context,
  dto: CreateTelegramAdvertiserContactDto,
) {
  const { prisma, workspaceId, advertiserId, userId } = context;
  const normalizedValue = context.normalize(dto.type, dto.value);
  if (!normalizedValue)
    throw new BadRequestException('Contact value is required');
  const contact = await prisma
    .$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "TelegramAdvertiser" WHERE "workspaceId"=${workspaceId} AND "id"=${advertiserId} FOR UPDATE`,
      );
      await context.authorize?.();
      if (dto.isPrimary)
        await tx.telegramAdvertiserContact.updateMany({
          where: { workspaceId, advertiserId, isPrimary: true },
          data: { isPrimary: false },
        });
      const created = await tx.telegramAdvertiserContact.create({
        data: {
          workspaceId,
          advertiserId,
          type: dto.type,
          value: dto.type === 'INSTAGRAM' ? dto.value : dto.value.trim(),
          normalizedValue,
          label: dto.label?.trim() || null,
          isPrimary: dto.isPrimary ?? false,
          isVerified:
            dto.type === 'INSTAGRAM' ? false : (dto.isVerified ?? false),
        },
      });
      await tx.telegramAdvertiserActivity.create({
        data: {
          workspaceId,
          advertiserId,
          actorUserId: userId,
          type: 'CONTACT_ADDED',
          title: `Contact added: ${dto.type}`,
          occurredAt: new Date(),
          metadata: {
            contactId: created.id,
            type: dto.type,
            ...(dto.type === 'INSTAGRAM'
              ? {
                  kind: 'INSTAGRAM_IDENTITY',
                  channel: 'INSTAGRAM',
                  username: normalizedValue,
                  profileVerification: 'UNVERIFIED',
                }
              : {}),
          },
        },
      });
      return created;
    })
    .catch(instagramContactConflict);
  return mapLegacyContactMethod(contact);
}
export async function updateCrmContactMethod(
  context: Context,
  contactId: string,
  dto: UpdateTelegramAdvertiserContactDto,
) {
  const { prisma, workspaceId, advertiserId, userId } = context;
  const contact = await prisma
    .$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "TelegramAdvertiser" WHERE "workspaceId"=${workspaceId} AND "id"=${advertiserId} FOR UPDATE`,
      );
      await context.authorize?.();
      const existing = await tx.telegramAdvertiserContact.findFirst({
        where: { id: contactId, workspaceId, advertiserId },
      });
      if (!existing)
        throw new NotFoundException('Telegram advertiser contact not found');
      const type = dto.type ?? existing.type,
        value = dto.value ?? existing.value,
        normalizedValue = context.normalize(type, value);
      if (!normalizedValue)
        throw new BadRequestException('Contact value is required');
      const renamed =
        type !== existing.type || normalizedValue !== existing.normalizedValue;
      const data = {
        type,
        value: type === 'INSTAGRAM' ? value : value.trim(),
        normalizedValue,
        ...(dto.label === undefined
          ? {}
          : { label: dto.label?.trim() || null }),
        ...(dto.isPrimary === undefined ? {} : { isPrimary: dto.isPrimary }),
        ...(type === 'INSTAGRAM'
          ? {
              isVerified: false,
              ...(renamed
                ? {
                    ownershipConfirmedAt: null,
                    ownershipConfirmedByUserId: null,
                  }
                : {}),
            }
          : dto.isVerified === undefined
            ? {}
            : { isVerified: dto.isVerified }),
      };
      if (
        Object.entries(data).every(
          ([key, value]) =>
            String(existing[key as keyof typeof existing]) === String(value),
        )
      )
        return existing;
      if (dto.isPrimary)
        await tx.telegramAdvertiserContact.updateMany({
          where: {
            workspaceId,
            advertiserId,
            isPrimary: true,
            id: { not: contactId },
          },
          data: { isPrimary: false },
        });
      const updated = await tx.telegramAdvertiserContact.update({
        where: { id: contactId },
        data,
      });
      if (type === 'INSTAGRAM')
        await tx.telegramAdvertiserActivity.create({
          data: {
            workspaceId,
            advertiserId,
            actorUserId: userId,
            type: 'CONTACT_ADDED',
            title: 'Instagram identity updated manually',
            occurredAt: new Date(),
            metadata: {
              kind: 'INSTAGRAM_IDENTITY',
              channel: 'INSTAGRAM',
              methodId: contactId,
              previousUsername:
                existing.type === 'INSTAGRAM' ? existing.normalizedValue : null,
              previousValue: existing.value.slice(0, 500),
              username: normalizedValue,
              profileVerification: 'UNVERIFIED',
              ownershipConfirmed: Boolean(updated.ownershipConfirmedAt),
            },
          },
        });
      return updated;
    })
    .catch(instagramContactConflict);
  return mapLegacyContactMethod(contact);
}

import { manualEditScope } from './telegram-crm-manual-operation';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TelegramAdvertiserContact } from '@prisma/client';
import {
  normalizeInstagramProfile,
  type CrmInstagramMethod,
  type CrmInstagramMethodInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';

export function instagramIdentity(value: string) {
  try {
    return normalizeInstagramProfile(value);
  } catch {
    throw new BadRequestException('INSTAGRAM_PROFILE_INVALID');
  }
}
export function mapInstagramMethod(
  row: Pick<
    TelegramAdvertiserContact,
    | 'id'
    | 'value'
    | 'normalizedValue'
    | 'identityState'
    | 'isPrimary'
    | 'ownershipConfirmedAt'
  >,
): CrmInstagramMethod {
  const profile = instagramIdentity(row.normalizedValue);
  return {
    id: row.id,
    value: row.value,
    username: profile.username,
    profileUrl: profile.profileUrl,
    state: row.identityState === 'STALE' ? 'STALE' : 'ACTIVE',
    isPrimary: row.isPrimary,
    ownershipConfirmed: Boolean(row.ownershipConfirmedAt),
    ownershipConfirmedAt: row.ownershipConfirmedAt?.toISOString() ?? null,
    profileVerification: 'UNVERIFIED',
  };
}
export const instagramMethodSelect = {
  id: true,
  value: true,
  normalizedValue: true,
  identityState: true,
  isPrimary: true,
  ownershipConfirmedAt: true,
} satisfies Prisma.TelegramAdvertiserContactSelect;

@Injectable()
export class TelegramCrmInstagramIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TelegramCrmLegacyAuthorizationService,
  ) {}
  async write(
    userId: string,
    contactId: string,
    input: CrmInstagramMethodInput,
    methodId?: string,
  ) {
    const scope = await manualEditScope(this.authorization, userId);
    const profile = instagramIdentity(input.value);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "TelegramAdvertiser" WHERE "workspaceId"=${scope.workspaceId} AND "id"=${contactId} FOR UPDATE`,
        );
        const contact = await tx.telegramAdvertiser.findFirst({
          where: {
            id: contactId,
            workspaceId: scope.workspaceId,
            ...(scope.ownerMemberId
              ? { ownerMemberId: scope.ownerMemberId }
              : {}),
          },
          select: { id: true },
        });
        if (!contact) throw new NotFoundException('CRM Contact not found');
        const existing = methodId
          ? await tx.telegramAdvertiserContact.findFirst({
              where: {
                id: methodId,
                workspaceId: scope.workspaceId,
                advertiserId: contactId,
              },
            })
          : null;
        if (methodId && !existing)
          throw new NotFoundException('CRM contact method not found');
        if (
          existing &&
          existing.type !== 'INSTAGRAM' &&
          !(
            existing.type === 'OTHER' &&
            /^instagram$/i.test(existing.label?.trim() ?? '')
          )
        )
          throw new BadRequestException(
            'INSTAGRAM_METHOD_TYPE_CHANGE_NOT_ALLOWED',
          );
        const collision = await tx.telegramAdvertiserContact.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            type: 'INSTAGRAM',
            normalizedValue: profile.username,
            ...(methodId ? { id: { not: methodId } } : {}),
          },
          select: { id: true },
        });
        if (collision)
          throw new ConflictException('INSTAGRAM_IDENTITY_ALREADY_LINKED');
        const renamed = Boolean(
          existing &&
          (existing.type !== 'INSTAGRAM' ||
            existing.normalizedValue !== profile.username),
        );
        const confirmation =
          !renamed && input.ownershipConfirmed
            ? (existing?.ownershipConfirmedAt ?? new Date())
            : null;
        const data = {
          type: 'INSTAGRAM' as const,
          value: profile.originalValue,
          normalizedValue: profile.username,
          identityState: input.state ?? existing?.identityState ?? 'ACTIVE',
          isPrimary: input.isPrimary ?? existing?.isPrimary ?? false,
          isVerified: false,
          ownershipConfirmedAt: confirmation,
          ownershipConfirmedByUserId: confirmation
            ? (existing?.ownershipConfirmedByUserId ?? userId)
            : null,
        };
        if (
          existing &&
          Object.entries(data).every(
            ([key, value]) =>
              String(existing[key as keyof typeof existing]) === String(value),
          )
        )
          return existing;
        if (data.isPrimary)
          await tx.telegramAdvertiserContact.updateMany({
            where: {
              workspaceId: scope.workspaceId,
              advertiserId: contactId,
              isPrimary: true,
              ...(methodId ? { id: { not: methodId } } : {}),
            },
            data: { isPrimary: false },
          });
        const result = existing
          ? await tx.telegramAdvertiserContact.update({
              where: { id: existing.id },
              data,
            })
          : await tx.telegramAdvertiserContact.create({
              data: {
                ...data,
                workspaceId: scope.workspaceId,
                advertiserId: contactId,
              },
            });
        await tx.telegramAdvertiserActivity.create({
          data: {
            workspaceId: scope.workspaceId,
            advertiserId: contactId,
            actorUserId: userId,
            type: 'CONTACT_ADDED',
            title: 'Instagram contact updated manually',
            occurredAt: new Date(),
            metadata: {
              kind: 'INSTAGRAM_IDENTITY',
              channel: 'INSTAGRAM',
              methodId: result.id,
              previousUsername:
                existing?.type === 'INSTAGRAM'
                  ? existing.normalizedValue
                  : null,
              previousValue: existing?.value.slice(0, 500) ?? null,
              username: profile.username,
              state: data.identityState,
              ownershipConfirmed: Boolean(confirmation),
              profileVerification: 'UNVERIFIED',
            },
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('INSTAGRAM_IDENTITY_ALREADY_LINKED');
      throw error;
    }
  }
}

export function instagramContactConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
    throw new ConflictException('INSTAGRAM_IDENTITY_ALREADY_LINKED');
  throw error;
}
export function mapLegacyContactMethod(contact: TelegramAdvertiserContact) {
  return {
    ...contact,
    ...(contact.type === 'INSTAGRAM'
      ? { instagram: mapInstagramMethod(contact), isVerified: false }
      : {}),
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type TelegramAdvertiserContact } from '@prisma/client';
import {
  normalizeInstagramProfile,
  type CrmInstagramMethod,
} from '@telegram-system/shared';

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

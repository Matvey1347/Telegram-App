import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmManualContactCreateInput } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';
import { instagramIdentity } from './telegram-crm-instagram-identity.service';
@Injectable()
export class TelegramCrmManualContactsCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: TelegramCrmLegacyAuthorizationService,
  ) {}
  async create(userId: string, input: CrmManualContactCreateInput) {
    const visibility = await this.crm.readScope(userId);
    if (
      visibility.ownerMemberId &&
      input.ownerMemberId &&
      input.ownerMemberId !== visibility.ownerMemberId
    )
      throw new ForbiddenException('Insufficient CRM ownership permission');
    const scope = await this.crm.createContactContext(
        userId,
        input.ownerMemberId ?? visibility.ownerMemberId,
      ),
      profile = instagramIdentity(input.instagramValue);
    const displayName = input.displayName.trim();
    if (!displayName || displayName.length > 300)
      throw new BadRequestException('CRM_CONTACT_NAME_INVALID');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.telegramAdvertiserContact.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            type: 'INSTAGRAM',
            normalizedValue: profile.username,
          },
          select: { id: true },
        });
        if (existing)
          throw new ConflictException('INSTAGRAM_IDENTITY_ALREADY_LINKED');
        // Deliberately no display-name matching: linking existing clients is an explicit command.
        const row = await tx.telegramAdvertiser.create({
          data: {
            workspaceId: scope.workspaceId,
            displayName,
            ownerMemberId: scope.resolvedOwnerMemberId,
            createdByUserId: userId,
            source: input.source?.trim() || 'MANUAL_INSTAGRAM',
            contacts: {
              create: {
                workspaceId: scope.workspaceId,
                type: 'INSTAGRAM',
                value: profile.originalValue,
                normalizedValue: profile.username,
                isPrimary: true,
                isVerified: false,
                ownershipConfirmedAt: input.ownershipConfirmed
                  ? new Date()
                  : null,
                ownershipConfirmedByUserId: input.ownershipConfirmed
                  ? userId
                  : null,
              },
            },
          },
          select: { id: true },
        });
        await tx.telegramAdvertiserActivity.create({
          data: {
            workspaceId: scope.workspaceId,
            advertiserId: row.id,
            actorUserId: userId,
            type: 'CONTACT_ADDED',
            title: 'Instagram-only client created manually',
            occurredAt: new Date(),
            metadata: {
              kind: 'INSTAGRAM_IDENTITY',
              channel: 'INSTAGRAM',
              username: profile.username,
              ownershipConfirmed: input.ownershipConfirmed,
              profileVerification: 'UNVERIFIED',
            },
          },
        });
        return row.id;
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

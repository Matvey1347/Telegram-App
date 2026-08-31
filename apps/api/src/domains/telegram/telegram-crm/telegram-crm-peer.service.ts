import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmPeer } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { UpsertCrmPeerDto } from './telegram-crm.dto';
import { isPrismaUniqueConflict } from './telegram-crm-prisma-errors';

const peerSelect = {
  id: true,
  workspaceId: true,
  telegramUserId: true,
  contactId: true,
  username: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TelegramCrmPeerSelect;

type PeerRow = Prisma.TelegramCrmPeerGetPayload<{ select: typeof peerSelect }>;
type PeerChanges = Partial<
  Pick<
    PeerRow,
    'contactId' | 'username' | 'firstName' | 'lastName' | 'photoUrl'
  >
>;

const mapPeer = (row: PeerRow): CrmPeer => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

@Injectable()
export class TelegramCrmPeerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async upsert(userId: string, dto: UpsertCrmPeerDto): Promise<CrmPeer> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const telegramUserId = dto.telegramUserId.trim();
    try {
      const row = await this.prisma.$transaction((tx) =>
        this.upsertInTransaction(tx, access.workspaceId, telegramUserId, dto),
      );
      return mapPeer(row);
    } catch (error) {
      if (!isPrismaUniqueConflict(error)) throw error;
      const row = await this.prisma.$transaction((tx) =>
        this.upsertInTransaction(tx, access.workspaceId, telegramUserId, dto),
      );
      return mapPeer(row);
    }
  }

  private async upsertInTransaction(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    telegramUserId: string,
    dto: UpsertCrmPeerDto,
  ) {
    await this.requireContact(tx, workspaceId, dto.contactId);
    const existing = await tx.telegramCrmPeer.findUnique({
      where: { workspaceId_telegramUserId: { workspaceId, telegramUserId } },
      select: peerSelect,
    });
    if (!existing) {
      return tx.telegramCrmPeer.create({
        data: {
          workspaceId,
          telegramUserId,
          contactId: dto.contactId ?? null,
          username: this.username(dto.username),
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          photoUrl: dto.photoUrl ?? null,
        },
        select: peerSelect,
      });
    }

    const data = this.changedFields(existing, dto);
    if (!Object.keys(data).length) return existing;
    const updated = await tx.telegramCrmPeer.update({
      where: { id: existing.id },
      data,
      select: peerSelect,
    });
    if (data.contactId !== undefined) {
      await tx.telegramCrmConversation.updateMany({
        where: {
          workspaceId,
          telegramCrmPeerId: existing.id,
          NOT: { contactId: data.contactId },
        },
        data: { contactId: data.contactId },
      });
    }
    return updated;
  }

  private changedFields(existing: PeerRow, dto: UpsertCrmPeerDto) {
    const candidates: Partial<
      Pick<
        PeerRow,
        'contactId' | 'username' | 'firstName' | 'lastName' | 'photoUrl'
      >
    > = {
      ...(dto.contactId === undefined ? {} : { contactId: dto.contactId }),
      ...(dto.username === undefined
        ? {}
        : { username: this.username(dto.username) }),
      ...(dto.firstName === undefined ? {} : { firstName: dto.firstName }),
      ...(dto.lastName === undefined ? {} : { lastName: dto.lastName }),
      ...(dto.photoUrl === undefined ? {} : { photoUrl: dto.photoUrl }),
    };
    return Object.fromEntries(
      Object.entries(candidates).filter(
        ([key, value]) => existing[key as keyof PeerRow] !== value,
      ),
    ) as PeerChanges;
  }

  private async requireContact(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    contactId: string | null | undefined,
  ) {
    if (!contactId) return;
    const contact = await tx.telegramAdvertiser.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!contact)
      throw new BadRequestException('CRM Contact is not in workspace');
  }

  private username(value: string | null | undefined) {
    return value?.trim().replace(/^@+/, '').toLowerCase() || null;
  }
}

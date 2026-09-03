import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmContactMergeResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';

const latest = (left: Date | null, right: Date | null) => {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
};

const earliest = (left: Date | null, right: Date | null) => {
  if (!left) return right;
  if (!right) return left;
  return left < right ? left : right;
};

@Injectable()
export class TelegramCrmContactMergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: TelegramCrmLegacyAuthorizationService,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async merge(
    userId: string,
    targetContactId: string,
    sourceContactId: string,
  ): Promise<CrmContactMergeResult> {
    if (targetContactId === sourceContactId) {
      throw new BadRequestException('Source and target Contacts must differ');
    }
    const [targetWorkspaceId, sourceWorkspaceId] = await Promise.all([
      this.authorization.requireEditContact(userId, targetContactId),
      this.authorization.requireEditContact(userId, sourceContactId),
    ]);
    if (targetWorkspaceId !== sourceWorkspaceId) {
      throw new NotFoundException('CRM Contact not found');
    }
    const workspaceId = targetWorkspaceId;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "TelegramAdvertiser"
        WHERE "workspaceId" = ${workspaceId}
          AND "id" IN (${targetContactId}, ${sourceContactId})
        ORDER BY "id"
        FOR UPDATE
      `);
      const contacts = await tx.telegramAdvertiser.findMany({
        where: { workspaceId, id: { in: [targetContactId, sourceContactId] } },
        select: {
          id: true,
          displayName: true,
          companyName: true,
          telegramUsername: true,
          phone: true,
          email: true,
          website: true,
          description: true,
          source: true,
          stage: true,
          archivedAt: true,
          ownerMemberId: true,
          lastContactAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          lastPurchaseAt: true,
          nextContactAt: true,
          firstPurchaseAt: true,
          repeatCustomerAt: true,
          totalSalesCount: true,
          completedSalesCount: true,
          totalPlacementsCount: true,
          totalRevenueInPrimaryCurrency: true,
          averageOrderValueInPrimaryCurrency: true,
          preferredCurrency: true,
          preferredContactMethod: true,
          defaultFollowUpDays: true,
        },
      });
      const target = contacts.find((contact) => contact.id === targetContactId);
      const source = contacts.find((contact) => contact.id === sourceContactId);
      if (!target || !source)
        throw new NotFoundException('CRM Contact not found');

      const targetTags = await tx.telegramAdvertiserTagAssignment.findMany({
        where: { workspaceId, advertiserId: targetContactId },
        select: { tagId: true },
      });
      const duplicateTags = targetTags.map((assignment) => assignment.tagId);
      const deletedTags = duplicateTags.length
        ? await tx.telegramAdvertiserTagAssignment.deleteMany({
            where: {
              workspaceId,
              advertiserId: sourceContactId,
              tagId: { in: duplicateTags },
            },
          })
        : { count: 0 };

      const moved: Record<string, number> = {};
      const move = async (
        key: string,
        operation: Promise<{ count: number }>,
      ) => {
        const value = await operation;
        moved[key] = value.count;
      };
      await move(
        'peers',
        tx.telegramCrmPeer.updateMany({
          where: { workspaceId, contactId: sourceContactId },
          data: { contactId: targetContactId },
        }),
      );
      await move(
        'conversations',
        tx.telegramCrmConversation.updateMany({
          where: { workspaceId, contactId: sourceContactId },
          data: { contactId: targetContactId },
        }),
      );
      await move(
        'deals',
        tx.telegramAdSale.updateMany({
          where: { workspaceId, advertiserId: sourceContactId },
          data: { advertiserId: targetContactId },
        }),
      );
      await move(
        'tasks',
        tx.telegramAdvertiserTask.updateMany({
          where: { workspaceId, advertiserId: sourceContactId },
          data: { advertiserId: targetContactId },
        }),
      );
      await move(
        'activities',
        tx.telegramAdvertiserActivity.updateMany({
          where: { workspaceId, advertiserId: sourceContactId },
          data: { advertiserId: targetContactId },
        }),
      );
      await move(
        'contactMethods',
        tx.telegramAdvertiserContact.updateMany({
          where: { workspaceId, advertiserId: sourceContactId },
          data: { advertiserId: targetContactId },
        }),
      );
      await move(
        'tags',
        tx.telegramAdvertiserTagAssignment.updateMany({
          where: { workspaceId, advertiserId: sourceContactId },
          data: { advertiserId: targetContactId },
        }),
      );
      moved.tags += deletedTags.count;
      await move(
        'internalAutomationExecutions',
        tx.telegramAdvertiserAutomationExecution.updateMany({
          where: { workspaceId, advertiserId: sourceContactId },
          data: { advertiserId: targetContactId },
        }),
      );
      await tx.telegramAdvertiser.update({
        where: { id: targetContactId },
        data: {
          displayName: target.displayName || source.displayName,
          companyName: target.companyName ?? source.companyName,
          telegramUsername: target.telegramUsername ?? source.telegramUsername,
          phone: target.phone ?? source.phone,
          email: target.email ?? source.email,
          website: target.website ?? source.website,
          description: target.description ?? source.description,
          source: target.source ?? source.source,
          lastContactAt: latest(target.lastContactAt, source.lastContactAt),
          lastInboundAt: latest(target.lastInboundAt, source.lastInboundAt),
          lastOutboundAt: latest(target.lastOutboundAt, source.lastOutboundAt),
          lastPurchaseAt: latest(target.lastPurchaseAt, source.lastPurchaseAt),
          nextContactAt: earliest(target.nextContactAt, source.nextContactAt),
          firstPurchaseAt: earliest(
            target.firstPurchaseAt,
            source.firstPurchaseAt,
          ),
          repeatCustomerAt: earliest(
            target.repeatCustomerAt,
            source.repeatCustomerAt,
          ),
          totalSalesCount: target.totalSalesCount + source.totalSalesCount,
          completedSalesCount:
            target.completedSalesCount + source.completedSalesCount,
          totalPlacementsCount:
            target.totalPlacementsCount + source.totalPlacementsCount,
          totalRevenueInPrimaryCurrency:
            target.totalRevenueInPrimaryCurrency.add(
              source.totalRevenueInPrimaryCurrency,
            ),
          averageOrderValueInPrimaryCurrency:
            target.totalSalesCount + source.totalSalesCount > 0
              ? target.totalRevenueInPrimaryCurrency
                  .add(source.totalRevenueInPrimaryCurrency)
                  .div(target.totalSalesCount + source.totalSalesCount)
              : 0,
          preferredCurrency:
            target.preferredCurrency ?? source.preferredCurrency,
          preferredContactMethod:
            target.preferredContactMethod ?? source.preferredContactMethod,
          defaultFollowUpDays:
            target.defaultFollowUpDays ?? source.defaultFollowUpDays,
        },
      });
      await tx.telegramAdvertiserActivity.create({
        data: {
          workspaceId,
          advertiserId: targetContactId,
          actorUserId: userId,
          type: 'ADVERTISER_MERGED',
          title: `Merged Contact ${source.displayName}`,
          description:
            'Source Contact fields and conflicts are retained in this merge snapshot.',
          occurredAt: new Date(),
          metadata: {
            sourceContactId,
            source: {
              displayName: source.displayName,
              companyName: source.companyName,
              telegramUsername: source.telegramUsername,
              phone: source.phone,
              email: source.email,
              website: source.website,
              description: source.description,
              source: source.source,
              stage: source.stage,
              ownerMemberId: source.ownerMemberId,
              archivedAt: source.archivedAt?.toISOString() ?? null,
              preferredCurrency: source.preferredCurrency,
              preferredContactMethod: source.preferredContactMethod,
              defaultFollowUpDays: source.defaultFollowUpDays,
              lastContactAt: source.lastContactAt?.toISOString() ?? null,
              lastInboundAt: source.lastInboundAt?.toISOString() ?? null,
              lastOutboundAt: source.lastOutboundAt?.toISOString() ?? null,
              lastPurchaseAt: source.lastPurchaseAt?.toISOString() ?? null,
              nextContactAt: source.nextContactAt?.toISOString() ?? null,
              firstPurchaseAt: source.firstPurchaseAt?.toISOString() ?? null,
              repeatCustomerAt: source.repeatCustomerAt?.toISOString() ?? null,
              totalSalesCount: source.totalSalesCount,
              completedSalesCount: source.completedSalesCount,
              totalPlacementsCount: source.totalPlacementsCount,
              totalRevenueInPrimaryCurrency:
                source.totalRevenueInPrimaryCurrency.toString(),
              averageOrderValueInPrimaryCurrency:
                source.averageOrderValueInPrimaryCurrency.toString(),
            },
            targetConflicts: {
              displayName: target.displayName,
              companyName: target.companyName,
              telegramUsername: target.telegramUsername,
              phone: target.phone,
              email: target.email,
              website: target.website,
              description: target.description,
              source: target.source,
            },
          },
        },
      });
      moved.activities += 1;
      await tx.telegramAdvertiser.delete({ where: { id: sourceContactId } });
      return { moved, ownerMemberId: target.ownerMemberId };
    });
    this.events.emit({
      type: 'contact.updated',
      workspaceId,
      occurredAt: new Date().toISOString(),
      contactId: targetContactId,
      ownerMemberId: result.ownerMemberId,
    });
    return { targetContactId, sourceContactId, moved: result.moved };
  }
}

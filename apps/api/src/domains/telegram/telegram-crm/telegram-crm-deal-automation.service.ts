import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CrmAutomationOverride,
  CrmDealAutomationUpdateResult,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';

@Injectable()
export class TelegramCrmDealAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly events: TelegramCrmEventHub,
  ) {}

  async update(
    userId: string,
    dealId: string,
    override: CrmAutomationOverride,
  ): Promise<CrmDealAutomationUpdateResult> {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.manageAutomation',
    );
    const deal = await this.prisma.telegramAdSale.findFirst({
      where: { id: dealId, workspaceId: access.workspaceId },
      select: {
        id: true,
        advertiserId: true,
        advertiser: { select: { ownerMemberId: true } },
        customerAutomationEligibleAt: true,
      },
    });
    if (!deal) throw new NotFoundException('CRM Deal not found');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: deal.advertiser?.ownerMemberId ?? null },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    if (
      override !== 'DISABLED' &&
      !deal.advertiserId
    ) {
      throw new BadRequestException(
        'A Deal must be linked to a Contact before automation can be enabled',
      );
    }

    const row = await this.prisma.telegramAdSale.update({
      where: { id: deal.id },
      data: {
        customerAutomationOverride: override,
        customerAutomationEligibleAt:
          override === 'DISABLED'
            ? deal.customerAutomationEligibleAt
            : (deal.customerAutomationEligibleAt ?? new Date()),
      },
      select: {
        id: true,
        customerAutomationOverride: true,
        customerAutomationEligibleAt: true,
      },
    });
    if (deal.advertiserId) {
      this.events.emit({
        type: 'contact.updated',
        workspaceId: access.workspaceId,
        contactId: deal.advertiserId,
        ownerMemberId: deal.advertiser?.ownerMemberId ?? null,
        occurredAt: new Date().toISOString(),
      });
    }
    return {
      dealId: row.id,
      override: row.customerAutomationOverride,
      eligibleAt: row.customerAutomationEligibleAt?.toISOString() ?? null,
    };
  }
}

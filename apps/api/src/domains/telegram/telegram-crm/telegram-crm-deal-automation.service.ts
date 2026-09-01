import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CrmDealAutomationStatus } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { validateCrmAutomationTypeOverrides } from './telegram-crm-automation-input';
import { TelegramCrmAutomationOccurrenceService } from './telegram-crm-automation-occurrence.service';
import { TelegramCrmAutomationStatusService } from './telegram-crm-automation-status.service';
import {
  UpdateCrmCustomerFollowUpDto,
  UpdateCrmDealAutomationDto,
} from './telegram-crm.dto';

const dealAutomationSelect = {
  id: true,
  workspaceId: true,
  advertiserId: true,
  customerAutomationOverride: true,
  customerAutomationEligibleAt: true,
  prePublicationAutomationOverride: true,
  publishedLinksAutomationOverride: true,
  followUpAutomationOverride: true,
  crmConversationId: true,
  advertiser: { select: { ownerMemberId: true } },
} satisfies Prisma.TelegramAdSaleSelect;

type DealRow = Prisma.TelegramAdSaleGetPayload<{
  select: typeof dealAutomationSelect;
}>;

@Injectable()
export class TelegramCrmDealAutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly occurrences: TelegramCrmAutomationOccurrenceService,
    private readonly statuses: TelegramCrmAutomationStatusService,
  ) {}

  async update(
    userId: string,
    dealId: string,
    dto: UpdateCrmDealAutomationDto,
  ): Promise<CrmDealAutomationStatus> {
    const deal = await this.requireDeal(userId, dealId);
    const overrides = validateCrmAutomationTypeOverrides(dto.typeOverrides);
    if (
      dto.override === undefined &&
      dto.conversationId === undefined &&
      !Object.keys(overrides).length
    ) {
      throw new BadRequestException('No Deal automation changes');
    }
    if (
      dto.override !== undefined &&
      dto.override !== 'DISABLED' &&
      !deal.advertiserId
    ) {
      throw new BadRequestException(
        'A Deal must be linked to a Contact before automation can be enabled',
      );
    }
    if (dto.conversationId !== undefined && dto.conversationId !== null) {
      await this.requireConversation(deal, dto.conversationId);
    }
    const now = new Date();
    const data: Prisma.TelegramAdSaleUpdateInput = {};
    if (dto.override !== undefined) {
      data.customerAutomationOverride = dto.override;
      if (
        dto.override !== 'DISABLED' &&
        (deal.customerAutomationOverride === 'DISABLED' ||
          !deal.customerAutomationEligibleAt)
      ) {
        data.customerAutomationEligibleAt = now;
      }
    }
    if (dto.conversationId !== undefined) {
      data.crmConversation = dto.conversationId
        ? {
            connect: {
              id_workspaceId: {
                id: dto.conversationId,
                workspaceId: deal.workspaceId,
              },
            },
          }
        : { disconnect: true };
    }
    this.assignOverride(
      data,
      overrides.PRE_PUBLICATION_REMINDER,
      deal.prePublicationAutomationOverride,
      'prePublicationAutomationOverride',
      'prePublicationAutomationEnabledAt',
      now,
    );
    this.assignOverride(
      data,
      overrides.PUBLISHED_LINKS,
      deal.publishedLinksAutomationOverride,
      'publishedLinksAutomationOverride',
      'publishedLinksAutomationEnabledAt',
      now,
    );
    this.assignOverride(
      data,
      overrides.FOLLOW_UP,
      deal.followUpAutomationOverride,
      'followUpAutomationOverride',
      'followUpAutomationEnabledAt',
      now,
    );
    await this.prisma.telegramAdSale.update({ where: { id: deal.id }, data });
    await this.handleOccurrenceChanges(deal, dto, overrides, now);
    return this.status(userId, deal);
  }

  async updateFollowUp(
    userId: string,
    dealId: string,
    dto: UpdateCrmCustomerFollowUpDto,
  ): Promise<CrmDealAutomationStatus> {
    const deal = await this.requireDeal(userId, dealId);
    if (!deal.advertiserId) {
      throw new BadRequestException(
        'A Deal must be linked to a Contact before follow-up configuration',
      );
    }
    const now = new Date();
    await this.prisma.telegramAdSale.update({
      where: { id: deal.id },
      data: {
        customerFollowUpAt: dto.dueAt ? new Date(dto.dueAt) : null,
        customerFollowUpVersion: { increment: 1 },
      },
    });
    await this.occurrences.recordFollowUpConfigured(
      deal.workspaceId,
      deal.id,
      now,
    );
    return this.status(userId, deal);
  }

  private async handleOccurrenceChanges(
    deal: DealRow,
    dto: UpdateCrmDealAutomationDto,
    overrides: ReturnType<typeof validateCrmAutomationTypeOverrides>,
    now: Date,
  ) {
    if (dto.override === 'DISABLED') {
      await this.occurrences.recordCancellation(deal.workspaceId, deal.id);
      return;
    }
    for (const [type, override] of Object.entries(overrides)) {
      if (override === 'DISABLED') {
        await this.occurrences.cancelType(
          deal.workspaceId,
          deal.id,
          type as 'PRE_PUBLICATION_REMINDER' | 'PUBLISHED_LINKS' | 'FOLLOW_UP',
          `DEAL_${type}_DISABLED`,
        );
      }
    }
    const explicitDealEnable =
      (dto.override === 'ENABLED' &&
        deal.customerAutomationOverride !== 'ENABLED') ||
      (dto.override === 'INHERIT' &&
        deal.customerAutomationOverride === 'DISABLED');
    const explicitTypeEnable = Object.entries(overrides).some(
      ([type, value]) =>
        (value === 'ENABLED' &&
          this.currentTypeOverride(deal, type) !== 'ENABLED') ||
        (value === 'INHERIT' &&
          this.currentTypeOverride(deal, type) === 'DISABLED'),
    );
    if (explicitDealEnable || explicitTypeEnable) {
      await this.occurrences.recordExplicitLegacyEnable(
        deal.workspaceId,
        deal.id,
        now,
      );
    }
  }

  private currentTypeOverride(deal: DealRow, type: string) {
    if (type === 'PRE_PUBLICATION_REMINDER') {
      return deal.prePublicationAutomationOverride;
    }
    if (type === 'PUBLISHED_LINKS') {
      return deal.publishedLinksAutomationOverride;
    }
    return deal.followUpAutomationOverride;
  }

  private async requireDeal(userId: string, dealId: string) {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.manageAutomation',
    );
    const deal = await this.prisma.telegramAdSale.findFirst({
      where: { id: dealId, workspaceId: access.workspaceId },
      select: dealAutomationSelect,
    });
    if (!deal) throw new NotFoundException('CRM Deal not found');
    await this.authorization.requireOwnOrAny(
      userId,
      { assignedMemberId: deal.advertiser?.ownerMemberId ?? null },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    return deal;
  }

  private async requireConversation(deal: DealRow, conversationId: string) {
    if (!deal.advertiserId) {
      throw new BadRequestException('A Deal Conversation requires a Contact');
    }
    const conversation = await this.prisma.telegramCrmConversation.findFirst({
      where: {
        id: conversationId,
        workspaceId: deal.workspaceId,
        contactId: deal.advertiserId,
        state: 'ACTIVE',
      },
      select: { id: true },
    });
    if (!conversation) {
      throw new BadRequestException(
        'Deal Conversation must be active and linked to its Contact',
      );
    }
  }

  private async status(userId: string, deal: DealRow) {
    if (!deal.advertiserId) {
      throw new BadRequestException('Deal is not linked to a CRM Contact');
    }
    const response = await this.statuses.get(userId, {
      contactId: deal.advertiserId,
      dealId: deal.id,
      limit: 1,
    });
    return response.deals[0];
  }

  private assignOverride(
    data: Prisma.TelegramAdSaleUpdateInput,
    value: 'INHERIT' | 'ENABLED' | 'DISABLED' | undefined,
    current: 'INHERIT' | 'ENABLED' | 'DISABLED',
    overrideKey:
      | 'prePublicationAutomationOverride'
      | 'publishedLinksAutomationOverride'
      | 'followUpAutomationOverride',
    enabledAtKey:
      | 'prePublicationAutomationEnabledAt'
      | 'publishedLinksAutomationEnabledAt'
      | 'followUpAutomationEnabledAt',
    now: Date,
  ) {
    if (value === undefined || value === current) return;
    data[overrideKey] = value;
    data[enabledAtKey] = now;
  }
}

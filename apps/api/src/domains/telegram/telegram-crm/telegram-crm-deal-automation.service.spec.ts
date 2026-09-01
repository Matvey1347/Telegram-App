import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramCrmDealAutomationService } from './telegram-crm-deal-automation.service';

describe('TelegramCrmDealAutomationService', () => {
  type DealFixture = {
    id: string;
    workspaceId: string;
    advertiserId: string | null;
    customerAutomationOverride: 'INHERIT' | 'ENABLED' | 'DISABLED';
    customerAutomationEligibleAt: Date | null;
    prePublicationAutomationOverride: 'INHERIT' | 'ENABLED' | 'DISABLED';
    publishedLinksAutomationOverride: 'INHERIT' | 'ENABLED' | 'DISABLED';
    followUpAutomationOverride: 'INHERIT' | 'ENABLED' | 'DISABLED';
    crmConversationId: string | null;
    advertiser: { ownerMemberId: string | null } | null;
  };
  const deal = {
    id: 'deal-1',
    workspaceId: 'workspace-1',
    advertiserId: 'contact-1',
    customerAutomationOverride: 'DISABLED' as const,
    customerAutomationEligibleAt: null,
    prePublicationAutomationOverride: 'INHERIT' as const,
    publishedLinksAutomationOverride: 'INHERIT' as const,
    followUpAutomationOverride: 'INHERIT' as const,
    crmConversationId: null,
    advertiser: { ownerMemberId: 'member-1' },
  } satisfies DealFixture;

  function setup(row: DealFixture | null = deal) {
    const prisma = {
      telegramAdSale: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue(row),
      },
      telegramCrmConversation: { findFirst: jest.fn() },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      requireOwnOrAny: jest.fn(),
    };
    const occurrences = {
      recordCancellation: jest.fn(),
      cancelType: jest.fn(),
      recordExplicitLegacyEnable: jest.fn(),
      recordFollowUpConfigured: jest.fn(),
    };
    const result = {
      dealId: 'deal-1',
      override: 'INHERIT',
      eligibleAt: new Date().toISOString(),
    };
    const statuses = { get: jest.fn().mockResolvedValue({ deals: [result] }) };
    return {
      prisma,
      authorization,
      occurrences,
      service: new TelegramCrmDealAutomationService(
        prisma as never,
        authorization as never,
        occurrences as never,
        statuses as never,
      ),
    };
  }

  it('requires permission and scopes the Deal to the workspace', async () => {
    const { prisma, authorization, service } = setup(null);
    await expect(
      service.update('user-1', 'other-deal', { override: 'ENABLED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authorization.require).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.manageAutomation',
    );
    expect(prisma.telegramAdSale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'other-deal', workspaceId: 'workspace-1' },
      }),
    );
  });

  it('makes a protected Deal eligible and materializes future facts on DISABLED to INHERIT', async () => {
    const { prisma, occurrences, service } = setup();
    await service.update('user-1', 'deal-1', { override: 'INHERIT' });
    const data = prisma.telegramAdSale.update.mock.calls[0]![0].data;
    expect(data.customerAutomationOverride).toBe('INHERIT');
    expect(data.customerAutomationEligibleAt).toBeInstanceOf(Date);
    expect(occurrences.recordExplicitLegacyEnable).toHaveBeenCalledWith(
      'workspace-1',
      'deal-1',
      expect.any(Date),
    );
  });

  it('stamps every per-type transition so DISABLED to INHERIT cannot resurrect old facts', async () => {
    const current = {
      ...deal,
      customerAutomationOverride: 'INHERIT' as const,
      customerAutomationEligibleAt: new Date('2026-09-01T00:00:00Z'),
      prePublicationAutomationOverride: 'DISABLED' as const,
    };
    const { prisma, occurrences, service } = setup(current);
    await service.update('user-1', 'deal-1', {
      typeOverrides: { PRE_PUBLICATION_REMINDER: 'INHERIT' },
    });
    expect(prisma.telegramAdSale.update.mock.calls[0]![0].data).toMatchObject({
      prePublicationAutomationOverride: 'INHERIT',
      prePublicationAutomationEnabledAt: expect.any(Date),
    });
    expect(occurrences.recordExplicitLegacyEnable).toHaveBeenCalled();
  });

  it('treats INHERIT to ENABLED as a fresh explicit Deal action', async () => {
    const current = {
      ...deal,
      customerAutomationOverride: 'INHERIT' as const,
      customerAutomationEligibleAt: new Date('2026-09-01T00:00:00Z'),
    };
    const { occurrences, service } = setup(current);

    await service.update('user-1', 'deal-1', { override: 'ENABLED' });

    expect(occurrences.recordExplicitLegacyEnable).toHaveBeenCalledWith(
      'workspace-1',
      'deal-1',
      expect.any(Date),
    );
  });

  it('treats INHERIT to type ENABLED as a fresh explicit Deal action', async () => {
    const current = {
      ...deal,
      customerAutomationOverride: 'INHERIT' as const,
      customerAutomationEligibleAt: new Date('2026-09-01T00:00:00Z'),
    };
    const { occurrences, service } = setup(current);

    await service.update('user-1', 'deal-1', {
      typeOverrides: { PRE_PUBLICATION_REMINDER: 'ENABLED' },
    });

    expect(occurrences.recordExplicitLegacyEnable).toHaveBeenCalledWith(
      'workspace-1',
      'deal-1',
      expect.any(Date),
    );
  });

  it('rejects invalid type override keys and values', async () => {
    const { prisma, service } = setup();
    await expect(
      service.update('user-1', 'deal-1', {
        typeOverrides: { UNKNOWN: 'ENABLED' } as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });

  it('does not write a cross-owner Deal', async () => {
    const { authorization, prisma, service } = setup();
    authorization.requireOwnOrAny.mockRejectedValue(new ForbiddenException());
    await expect(
      service.update('user-1', 'deal-1', { override: 'ENABLED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });
});

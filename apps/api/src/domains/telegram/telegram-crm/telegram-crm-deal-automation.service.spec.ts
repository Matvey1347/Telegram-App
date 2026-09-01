import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramCrmAutomationOverride } from '@prisma/client';
import { TelegramCrmDealAutomationService } from './telegram-crm-deal-automation.service';

describe('TelegramCrmDealAutomationService', () => {
  const eligibleAt = new Date('2026-08-31T10:00:00.000Z');

  function setup(
    deal: {
      id: string;
      advertiserId: string | null;
      advertiser?: { ownerMemberId: string | null } | null;
      customerAutomationEligibleAt: Date | null;
    } | null,
  ) {
    const prisma = {
      telegramAdSale: {
        findFirst: jest.fn().mockResolvedValue(deal),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: deal?.id,
            customerAutomationOverride: data.customerAutomationOverride,
            customerAutomationEligibleAt: data.customerAutomationEligibleAt,
          }),
        ),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      requireOwnOrAny: jest.fn().mockResolvedValue(undefined),
    };
    const events = { emit: jest.fn() };
    return {
      prisma,
      authorization,
      events,
      service: new TelegramCrmDealAutomationService(
        prisma as never,
        authorization as never,
        events as never,
      ),
    };
  }

  it('requires automation permission and scopes the Deal to the workspace', async () => {
    const { prisma, authorization, service } = setup(null);

    await expect(
      service.update(
        'user-1',
        'deal-other-workspace',
        TelegramCrmAutomationOverride.ENABLED,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(authorization.require).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.manageAutomation',
    );
    expect(prisma.telegramAdSale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-other-workspace', workspaceId: 'workspace-1' },
      }),
    );
    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });

  it('makes a migrated protected Deal eligible only after an explicit action', async () => {
    const { authorization, prisma, service } = setup({
      id: 'deal-1',
      advertiserId: 'contact-1',
      advertiser: { ownerMemberId: 'member-1' },
      customerAutomationEligibleAt: null,
    });

    const result = await service.update(
      'user-1',
      'deal-1',
      TelegramCrmAutomationOverride.INHERIT,
    );

    const update = prisma.telegramAdSale.update.mock.calls[0]![0];
    expect(update.data.customerAutomationOverride).toBe('INHERIT');
    expect(update.data.customerAutomationEligibleAt).toBeInstanceOf(Date);
    expect(result).toMatchObject({ dealId: 'deal-1', override: 'INHERIT' });
    expect(result.eligibleAt).not.toBeNull();
    expect(authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user-1',
      { assignedMemberId: 'member-1' },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
  });

  it('rejects a cross-owner Deal even with automation permission', async () => {
    const { authorization, prisma, service } = setup({
      id: 'deal-1',
      advertiserId: 'contact-1',
      advertiser: { ownerMemberId: 'member-2' },
      customerAutomationEligibleAt: null,
    });
    authorization.requireOwnOrAny.mockRejectedValue(new ForbiddenException());

    await expect(
      service.update(
        'user-1',
        'deal-1',
        TelegramCrmAutomationOverride.ENABLED,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });

  it('keeps the immutable cutover when a Deal is disabled', async () => {
    const { prisma, service } = setup({
      id: 'deal-1',
      advertiserId: 'contact-1',
      advertiser: { ownerMemberId: 'member-1' },
      customerAutomationEligibleAt: eligibleAt,
    });

    await service.update(
      'user-1',
      'deal-1',
      TelegramCrmAutomationOverride.DISABLED,
    );

    expect(
      prisma.telegramAdSale.update.mock.calls[0]![0].data
        .customerAutomationEligibleAt,
    ).toBe(eligibleAt);
  });

  it('does not enable automation for a Deal without a Contact', async () => {
    const { prisma, service } = setup({
      id: 'deal-1',
      advertiserId: null,
      advertiser: null,
      customerAutomationEligibleAt: null,
    });

    await expect(
      service.update(
        'user-1',
        'deal-1',
        TelegramCrmAutomationOverride.ENABLED,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.telegramAdSale.update).not.toHaveBeenCalled();
  });

  it('can keep an unlinked Deal disabled without emitting a malformed Contact event', async () => {
    const { events, service } = setup({
      id: 'deal-1',
      advertiserId: null,
      advertiser: null,
      customerAutomationEligibleAt: null,
    });

    await expect(
      service.update(
        'user-1',
        'deal-1',
        TelegramCrmAutomationOverride.DISABLED,
      ),
    ).resolves.toMatchObject({ override: 'DISABLED', eligibleAt: null });
    expect(events.emit).not.toHaveBeenCalled();
  });
});

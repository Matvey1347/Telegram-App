import { ForbiddenException } from '@nestjs/common';
import { TelegramAdSalesLegacyCrmService } from './telegram-ad-sales-legacy-crm.service';

function createService() {
  const adSales = {
    listAdvertisers: jest.fn(),
    advertiserSearch: jest.fn(),
    updateAdvertiser: jest.fn(),
    listCrmTasks: jest.fn(),
  };
  const authorization = {
    readScope: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-1',
      ownerMemberId: 'member-1',
    }),
    requireEditContact: jest.fn(),
    requireOwnerChange: jest.fn(),
  };
  const tasks = { list: jest.fn() };
  return {
    service: new TelegramAdSalesLegacyCrmService(
      adSales as never,
      authorization as never,
      tasks as never,
    ),
    adSales,
    authorization,
    tasks,
  };
}

describe('TelegramAdSalesLegacyCrmService', () => {
  it('forces Contact and task lists to the authorized owner scope', async () => {
    const { service, adSales, tasks } = createService();

    await service.listAdvertisers('user-1', {
      page: 1,
      pageSize: 25,
      ownerMemberId: 'attacker-selected-member',
    });
    await service.listCrmTasks('user-1', { page: 1, pageSize: 25 });

    expect(adSales.listAdvertisers).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ownerMemberId: 'member-1' }),
    );
    expect(tasks.list).toHaveBeenCalledWith(
      'user-1',
      expect.any(Object),
      'member-1',
    );
  });

  it('does not delegate a legacy PATCH when edit ownership is denied', async () => {
    const { service, adSales, authorization } = createService();
    authorization.requireEditContact.mockRejectedValue(
      new ForbiddenException('Insufficient CRM ownership permission'),
    );

    await expect(
      service.updateAdvertiser('user-1', 'contact-2', {
        displayName: 'Blocked update',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(adSales.updateAdvertiser).not.toHaveBeenCalled();
  });

  it('passes view-own scope into legacy advertiser search', async () => {
    const { service, adSales } = createService();

    await service.advertiserSearch('user-1', { q: 'Peer', limit: 10 });

    expect(adSales.advertiserSearch).toHaveBeenCalledWith(
      'user-1',
      { q: 'Peer', limit: 10 },
      'member-1',
    );
  });
});

import { TelegramCrmContactExportService } from './telegram-crm-contact-export.service';

describe('TelegramCrmContactExportService', () => {
  it('exports only active contacts from the current workspace and preserves purchase history', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'contact-1',
        displayName: 'Ada',
        telegramUsername: 'ada',
        tags: [{ tag: { name: 'Buyers' } }],
        sales: [
          {
            title: 'Autumn placement',
            status: 'CONFIRMED',
            settlementCurrency: 'USD',
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
          },
        ],
      },
    ]);
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      scope: jest.fn().mockResolvedValue({}),
    };
    const service = new TelegramCrmContactExportService(
      { telegramAdvertiser: { findMany } } as never,
      authorization as never,
    );

    await expect(service.export('user-1', 'TAGGED')).resolves.toEqual([
      {
        id: 'contact-1',
        displayName: 'Ada',
        telegramUsername: 'ada',
        tags: ['Buyers'],
        purchases: [
          {
            title: 'Autumn placement',
            status: 'CONFIRMED',
            currency: 'USD',
            createdAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace-1',
          archivedAt: null,
          tags: { some: {} },
        }),
      }),
    );
  });

  it('applies the view-own scope and the untagged segment', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TelegramCrmContactExportService(
      { telegramAdvertiser: { findMany } } as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      } as never,
    );

    await service.export('user-1', 'UNTAGGED');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerMemberId: 'member-1',
          tags: { none: {} },
        }),
      }),
    );
  });
});

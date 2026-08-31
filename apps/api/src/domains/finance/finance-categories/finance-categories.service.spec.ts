import { FinanceCategoriesService } from './finance-categories.service';

describe('FinanceCategoriesService', () => {
  it('merges legacy Telegram Ad Sales income category into Channel Advertising Revenue', async () => {
    const prisma: any = {
      icon: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce({ id: 'icon-channel' })
          .mockResolvedValueOnce({ id: 'icon-reversal' })
          .mockResolvedValueOnce({ id: 'icon-salary' }),
      },
      transactionCategory: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'legacy-category',
              key: 'telegram_ad_sales',
              name: 'Telegram Ad Sales',
            },
          ]),
        upsert: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'salary-category',
            name: 'Salary',
          })
          .mockResolvedValueOnce({
            id: 'investment-category',
            name: 'Investment',
          })
          .mockResolvedValueOnce({
            id: 'channel-revenue-category',
            name: 'Channel Advertising Revenue',
          })
          .mockResolvedValueOnce({
            id: 'reversal-category',
            name: 'Telegram Ad Sales Reversal',
          })
          .mockResolvedValueOnce({
            id: 'advertising-category',
            name: 'Advertising',
          })
          .mockResolvedValueOnce({
            id: 'buy-channels-category',
            name: 'Buy Channels',
          }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const workspaceService: any = {};
    const service = new FinanceCategoriesService(prisma, workspaceService);

    await service.ensureSystemCategories('ws-1');

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'ws-1',
        OR: [
          { categoryId: { in: ['legacy-category'] } },
          { category: 'Telegram Ad Sales' },
        ],
      },
      data: {
        categoryId: 'channel-revenue-category',
        category: 'Channel Advertising Revenue',
      },
    });
    expect(prisma.transactionCategory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['legacy-category'] } },
    });
    expect(prisma.icon.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { emoji: '💼' },
        create: expect.objectContaining({ name: 'salary', emoji: '💼' }),
      }),
    );
    expect(prisma.transactionCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_type_key: {
            workspaceId: 'ws-1',
            type: 'expense',
            key: 'salary',
          },
        },
        update: {
          isSystem: true,
          name: 'Salary',
          iconId: 'icon-salary',
        },
      }),
    );
  });

  it('performs one read and zero writes for an established workspace', async () => {
    const prisma: any = {
      icon: { upsert: jest.fn() },
      transactionCategory: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'investment', name: 'Investment', isSystem: true, icon: null },
          {
            key: 'channel_advertising_revenue',
            name: 'Channel Advertising Revenue',
            isSystem: true,
            icon: { name: 'channel-advertising-revenue', emoji: '👛' },
          },
          {
            key: 'telegram_ad_sales_reversal',
            name: 'Telegram Ad Sales Reversal',
            isSystem: true,
            icon: { name: 'telegram-ad-sales-reversal', emoji: '↩️' },
          },
          {
            key: 'advertising',
            name: 'Advertising',
            isSystem: true,
            icon: null,
          },
          {
            key: 'buy_channels',
            name: 'Buy Channels',
            isSystem: true,
            icon: null,
          },
          {
            key: 'salary',
            name: 'Salary',
            isSystem: true,
            icon: { name: 'salary', emoji: '💼' },
          },
        ]),
        upsert: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
      },
      transaction: { updateMany: jest.fn() },
    };
    const service = new FinanceCategoriesService(prisma, {} as any);

    await service.ensureSystemCategories('ws-1');

    expect(prisma.transactionCategory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.icon.upsert).not.toHaveBeenCalled();
    expect(prisma.transactionCategory.upsert).not.toHaveBeenCalled();
    expect(prisma.transactionCategory.update).not.toHaveBeenCalled();
    expect(prisma.transactionCategory.deleteMany).not.toHaveBeenCalled();
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled();
  });
});

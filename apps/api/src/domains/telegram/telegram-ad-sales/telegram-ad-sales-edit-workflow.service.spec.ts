import { TelegramAdSalesEditWorkflowService } from './telegram-ad-sales-edit-workflow.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

function setup() {
  const sale = {
    id: 'sale-a',
    placements: [
      {
        id: 'placement-a',
        status: 'RESERVED',
        managedPostId: null,
      },
    ],
  };
  const sales = {
    getSale: jest.fn().mockResolvedValue(sale),
    updateSale: jest.fn().mockResolvedValue(undefined),
    updatePlacement: jest
      .fn()
      .mockResolvedValue({ id: 'placement-a', status: 'RESERVED', managedPostId: null }),
    createManagedPostFromPlacement: jest.fn().mockResolvedValue({ id: 'post-a' }),
    schedulePlacement: jest.fn().mockResolvedValue(undefined),
    attachManagedPost: jest.fn().mockResolvedValue(undefined),
    updatePayment: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<TelegramAdSalesService>;
  return { sales, service: new TelegramAdSalesEditWorkflowService(sales), sale };
}

const placement = {
  id: 'placement-a',
  scheduledAt: '2026-11-04T14:00:00.000Z',
  timezone: 'Europe/Warsaw',
  agreedPrice: 10,
  currency: 'USD',
  managedPostDraft: { title: 'Campaign', text: 'Text', imageUrls: [], buttonRows: [] },
};

describe('TelegramAdSalesEditWorkflowService', () => {
  it('saves placement, creates and schedules its post in one reported workflow', async () => {
    const { sales, service, sale } = setup();
    const progress: Array<{ operation: string; current: number; total: number }> = [];
    const result = await service.save('user-a', 'sale-a', {
      placements: [placement],
      payments: [],
    }, (item, current, total) => progress.push({ operation: item.operation, current, total }));

    expect(result).toBe(sale);
    expect(sales.updatePlacement).toHaveBeenCalledTimes(1);
    expect(sales.createManagedPostFromPlacement).toHaveBeenCalledTimes(1);
    expect(sales.schedulePlacement).toHaveBeenCalledWith('user-a', 'sale-a', 'placement-a', {
      scheduledAt: placement.scheduledAt,
    });
    expect(progress.map(({ operation }) => operation)).toEqual([
      'LOAD', 'UPDATE_PLACEMENT', 'CREATE_POST', 'SCHEDULE_POST', 'REFRESH',
    ]);
    expect(progress.at(-1)).toMatchObject({ current: 5, total: 5 });
  });

  it('reports a scheduling failure without losing the post link created before it', async () => {
    const { sales, service } = setup();
    (sales.schedulePlacement as jest.Mock).mockRejectedValueOnce(new Error('Telegram unavailable'));
    const progress: string[] = [];

    await expect(service.save('user-a', 'sale-a', {
      placements: [placement],
      payments: [],
    }, (item) => progress.push(item.operation))).rejects.toThrow('Telegram unavailable');

    expect(sales.createManagedPostFromPlacement).toHaveBeenCalledTimes(1);
    expect(sales.schedulePlacement).toHaveBeenCalledTimes(1);
    expect(sales.getSale).toHaveBeenCalledTimes(1);
    expect(progress).toEqual(['LOAD', 'UPDATE_PLACEMENT', 'CREATE_POST']);
  });

  it('links a selected published post inside the same workflow', async () => {
    const { sales, service } = setup();
    await service.save('user-a', 'sale-a', {
      placements: [{
        ...placement,
        managedPostDraft: undefined,
        postAttachment: { telegramPostUrl: 'https://t.me/channel/42' },
      }],
      payments: [],
    }, () => undefined);

    expect(sales.attachManagedPost).toHaveBeenCalledWith('user-a', 'sale-a', 'placement-a', {
      telegramPostUrl: 'https://t.me/channel/42',
    });
    expect(sales.createManagedPostFromPlacement).not.toHaveBeenCalled();
  });
});

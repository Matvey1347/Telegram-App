/* eslint-disable @typescript-eslint/no-unsafe-assignment,
  @typescript-eslint/no-unsafe-call,
  @typescript-eslint/no-unsafe-member-access -- Jest asymmetric matchers and mock-call inspection */
import {
  loadAdSalesProductsForChannelsWithDefaults,
  materializeDefaultAdSalesProductsForChannels,
} from './telegram-ad-sales-default-products';

const channels = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `channel-${index + 1}`,
    adBaseCurrency: index % 2 ? 'UAH' : 'USD',
  }));

const productNames = ['1/24', '2/48', '3/72', 'No auto-delete'];

const existingProducts = (channelCount: number) =>
  channels(channelCount).flatMap((channel) =>
    productNames.map((name) => ({
      telegramChannelId: channel.id,
      name,
    })),
  );

function prisma() {
  return {
    telegramAdProduct: {
      findMany: jest.fn(),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('batched Ad Sales default products', () => {
  it.each([1, 10, 50, 100])(
    'performs zero reads and writes when %i channel batch is already complete',
    async (channelCount) => {
      const db = prisma();

      await expect(
        materializeDefaultAdSalesProductsForChannels(db as never, {
          workspaceId: 'workspace-1',
          channels: channels(channelCount),
          existingProducts: existingProducts(channelCount),
        }),
      ).resolves.toBe(false);

      expect(db.telegramAdProduct.findMany).not.toHaveBeenCalled();
      expect(db.telegramAdProduct.createMany).not.toHaveBeenCalled();
    },
  );

  it('materializes four hundred missing defaults for one hundred channels in one write', async () => {
    const db = prisma();

    await expect(
      materializeDefaultAdSalesProductsForChannels(db as never, {
        workspaceId: 'workspace-1',
        channels: channels(100),
        existingProducts: [],
      }),
    ).resolves.toBe(true);

    expect(db.telegramAdProduct.createMany).toHaveBeenCalledTimes(1);
    expect(db.telegramAdProduct.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          name: '1/24',
          currency: 'USD',
        }),
        expect.objectContaining({
          telegramChannelId: 'channel-100',
          name: 'No auto-delete',
          currency: 'UAH',
        }),
      ]),
    });
    expect(db.telegramAdProduct.createMany.mock.calls[0][0].data).toHaveLength(
      400,
    );
  });

  it('creates only missing formats for a partially initialized channel', async () => {
    const db = prisma();

    await materializeDefaultAdSalesProductsForChannels(db as never, {
      workspaceId: 'workspace-1',
      channels: channels(1),
      existingProducts: [
        { telegramChannelId: 'channel-1', name: '1/24' },
        { telegramChannelId: 'channel-1', name: '1/Permanent' },
      ],
    });

    expect(
      db.telegramAdProduct.createMany.mock.calls[0][0].data.map(
        (item: { name: string }) => item.name,
      ),
    ).toEqual(['2/48', '3/72']);
  });

  it('refetches persisted ids once after a concurrent-safe createMany', async () => {
    const db = prisma();
    const stored = [{ id: 'product-1', ...existingProducts(1)[0] }];
    db.telegramAdProduct.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(stored);

    await expect(
      loadAdSalesProductsForChannelsWithDefaults(db as never, {
        workspaceId: 'workspace-1',
        channels: channels(1),
      }),
    ).resolves.toBe(stored);

    expect(db.telegramAdProduct.findMany).toHaveBeenCalledTimes(2);
    expect(db.telegramAdProduct.createMany).toHaveBeenCalledTimes(1);
    expect(db.telegramAdProduct.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('propagates a materialization failure without returning partial defaults', async () => {
    const db = prisma();
    db.telegramAdProduct.createMany.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      materializeDefaultAdSalesProductsForChannels(db as never, {
        workspaceId: 'workspace-1',
        channels: channels(1),
        existingProducts: [],
      }),
    ).rejects.toThrow('database unavailable');
  });
});

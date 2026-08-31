/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers and partial Prisma mocks are intentionally untyped. */
import { TelegramAdvertiserCheckoutResolverService } from './telegram-advertiser-checkout-resolver.service';

describe('TelegramAdvertiserCheckoutResolverService', () => {
  const advertiser = {
    id: 'advertiser-1',
    displayName: '@same_client',
    telegramUsername: 'same_client',
    companyName: null,
  };

  const setup = () => {
    const tx = {
      telegramAdvertiserContact: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      telegramAdvertiser: {
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(advertiser),
      },
    };
    const service = new TelegramAdvertiserCheckoutResolverService();
    return { service, tx };
  };

  it.each(['same_client', '@same_client'])(
    'reuses the same client for normalized handle %s',
    async (contact) => {
      const { service, tx } = setup();
      tx.telegramAdvertiserContact.findFirst.mockResolvedValue({ advertiser });
      await expect(
        service.resolve(
          tx as never,
          {
            advertiserName: contact,
            advertiserContact: contact,
            createAdvertiser: true,
          },
          {
            workspaceId: 'workspace-1',
            userId: 'user-1',
            ownerMemberId: null,
            selected: null,
          },
        ),
      ).resolves.toEqual(advertiser);
      expect(tx.telegramAdvertiserContact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ normalizedValue: 'same_client' }),
        }),
      );
      expect(tx.telegramAdvertiser.create).not.toHaveBeenCalled();
    },
  );

  it('creates a normalized Telegram contact for a first-time client', async () => {
    const { service, tx } = setup();
    tx.telegramAdvertiserContact.findFirst.mockResolvedValue(null);
    tx.telegramAdvertiser.findFirst.mockResolvedValue(null);
    await service.resolve(
      tx as never,
      {
        advertiserName: 'same_client',
        advertiserContact: 'same_client',
        createAdvertiser: true,
      },
      {
        workspaceId: 'workspace-1',
        userId: 'user-1',
        ownerMemberId: 'member-1',
        selected: null,
      },
    );
    expect(tx.telegramAdvertiser.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telegramUsername: 'same_client' }),
      }),
    );
    expect(tx.telegramAdvertiserContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        advertiserId: 'advertiser-1',
        normalizedValue: 'same_client',
      }),
    });
  });

  it('rejects an invalid explicit Telegram username', async () => {
    const { service, tx } = setup();
    await expect(
      service.resolve(
        tx as never,
        {
          advertiserName: 'bad name',
          advertiserTelegram: '@bad name',
          advertiserContact: '@bad name',
          createAdvertiser: true,
        },
        {
          workspaceId: 'workspace-1',
          userId: 'user-1',
          ownerMemberId: null,
          selected: null,
        },
      ),
    ).rejects.toThrow(
      'Telegram username must contain 5-32 letters, numbers, or underscores',
    );
    expect(tx.telegramAdvertiser.create).not.toHaveBeenCalled();
  });
});

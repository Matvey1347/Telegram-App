import { BadRequestException } from '@nestjs/common';
import { FinanceCustomIconService } from './finance-custom-icon.service';

describe('FinanceCustomIconService', () => {
  const prisma = {
    financeCustomIcon: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const storage = { persistImmutableImages: jest.fn() };
  const service = new FinanceCustomIconService(
    prisma as never,
    storage as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('stores a named image for reuse within the authenticated Finance profile', async () => {
    prisma.financeCustomIcon.upsert.mockResolvedValue({
      id: 'icon-1',
      name: 'My card',
      imageUrl: 'https://cdn.test/card.png',
    });

    await expect(
      service.save('profile-1', {
        name: ' My card ',
        imageUrl: ' https://cdn.test/card.png ',
      }),
    ).resolves.toEqual({
      id: 'icon-1',
      name: 'My card',
      imageUrl: 'https://cdn.test/card.png',
    });
    expect(prisma.financeCustomIcon.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId_name: { profileId: 'profile-1', name: 'My card' } },
        create: {
          profileId: 'profile-1',
          name: 'My card',
          imageUrl: 'https://cdn.test/card.png',
        },
      }),
    );
  });

  it('rejects a missing or unsupported image before storage work', async () => {
    await expect(service.upload(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.upload({
        size: 12,
        mimetype: 'application/pdf',
        buffer: Buffer.from('not image'),
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.persistImmutableImages).not.toHaveBeenCalled();
  });
});

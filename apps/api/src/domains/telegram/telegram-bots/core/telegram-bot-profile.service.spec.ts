import { BadRequestException } from '@nestjs/common';
import { TelegramBotRuntimeEnvironment } from '@prisma/client';
import { TelegramBotProfileService } from './telegram-bot-profile.service';

describe('TelegramBotProfileService', () => {
  const runtime = {
    id: 'runtime-1',
    botId: '42',
    firstName: 'Old name',
    botTokenEncrypted: 'encrypted',
    botTokenIv: 'iv',
    botTokenAuthTag: 'tag',
  };
  const prisma = {
    telegramBotRuntimeInstance: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const encryption = { decrypt: jest.fn().mockReturnValue('token') } as any;
  const botApi = {
    getMyName: jest.fn(),
    setMyName: jest.fn(),
    getUserProfilePhotos: jest.fn(),
    getFile: jest.fn(),
    downloadFile: jest.fn(),
    setMyProfilePhoto: jest.fn(),
  } as any;
  const service = new TelegramBotProfileService(prisma, encryption, botApi);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.telegramBotRuntimeInstance.findUnique.mockResolvedValue(runtime);
    prisma.telegramBotRuntimeInstance.update.mockImplementation(({ data }: any) => ({
      ...runtime,
      ...data,
    }));
  });

  it('pulls the current Telegram name and absence of a profile photo', async () => {
    botApi.getMyName.mockResolvedValue({ name: 'Finance Bot' });
    botApi.getUserProfilePhotos.mockResolvedValue({ total_count: 0, photos: [] });

    await service.sync('bot-1', TelegramBotRuntimeEnvironment.PRODUCTION);

    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith({
      where: { id: 'runtime-1' },
      data: {
        firstName: 'Finance Bot',
      },
    });
  });

  it('does not download or persist an unchanged Telegram profile', async () => {
    prisma.telegramBotRuntimeInstance.findUnique.mockResolvedValue({
      ...runtime,
      firstName: 'Finance Bot',
      avatarTelegramFileId: 'photo-1',
      avatarImage: Uint8Array.from([1]),
    });
    botApi.getMyName.mockResolvedValue({ name: 'Finance Bot' });
    botApi.getUserProfilePhotos.mockResolvedValue({
      total_count: 1,
      photos: [[{ file_id: 'photo-1' }]],
    });

    await service.sync('bot-1', TelegramBotRuntimeEnvironment.PRODUCTION);

    expect(botApi.getFile).not.toHaveBeenCalled();
    expect(botApi.downloadFile).not.toHaveBeenCalled();
    expect(prisma.telegramBotRuntimeInstance.update).not.toHaveBeenCalled();
  });

  it('updates the bot name through the selected runtime token', async () => {
    await service.update('bot-1', TelegramBotRuntimeEnvironment.LOCAL, {
      name: 'Finance Dev',
    });

    expect(botApi.setMyName).toHaveBeenCalledWith('token', 'Finance Dev');
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { firstName: 'Finance Dev' } }),
    );
  });

  it('rejects an empty profile update without calling Telegram', async () => {
    await expect(
      service.update('bot-1', TelegramBotRuntimeEnvironment.PRODUCTION, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(botApi.setMyName).not.toHaveBeenCalled();
    expect(botApi.setMyProfilePhoto).not.toHaveBeenCalled();
  });

  it('normalizes an uploaded image before changing the Telegram photo', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await service.update('bot-1', TelegramBotRuntimeEnvironment.PRODUCTION, {
      avatar: { buffer: png, mimetype: 'image/png' } as Express.Multer.File,
    });

    const jpeg = botApi.setMyProfilePhoto.mock.calls[0][1] as Buffer;
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(prisma.telegramBotRuntimeInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarMimeType: 'image/jpeg' }),
      }),
    );
  });
});

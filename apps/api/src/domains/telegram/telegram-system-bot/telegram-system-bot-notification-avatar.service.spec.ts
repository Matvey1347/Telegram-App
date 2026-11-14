import { TelegramSystemBotNotificationAvatarService } from './telegram-system-bot-notification-avatar.service';

describe('notification avatars', () => {
  it('loads and caches group and user photos without exposing bot credentials', async () => {
    const api = { getChat: jest.fn().mockResolvedValue({ photo: { small_file_id: 'group-photo' } }), getUserProfilePhotos: jest.fn().mockResolvedValue({ photos: [[{ file_id: 'user-photo' }]] }), getFile: jest.fn().mockResolvedValue({ file_path: 'photo.jpg' }), downloadFile: jest.fn().mockResolvedValue({ bytes: Buffer.from('image'), contentType: 'image/jpeg' }) };
    const service = new TelegramSystemBotNotificationAvatarService(api as never, { token: 'secret' } as never);
    expect(await service.get('group', '-100')).toBe('data:image/jpeg;base64,aW1hZ2U=');
    expect(await service.get('user', '123')).toBe('data:image/jpeg;base64,aW1hZ2U=');
    await service.get('user', '123');
    expect(api.getUserProfilePhotos).toHaveBeenCalledTimes(1);
  });
  it('uses the fallback when Telegram cannot return a photo', async () => {
    const service = new TelegramSystemBotNotificationAvatarService({ getChat: jest.fn().mockRejectedValue(new Error('unavailable')) } as never, { token: 'secret' } as never);
    await expect(service.get('group', '-100')).resolves.toBeNull();
  });
});

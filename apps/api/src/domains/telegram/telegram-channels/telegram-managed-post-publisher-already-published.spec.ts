import { TelegramManagedPostPublisherService } from './telegram-managed-post-publisher.service';

describe('published managed post protection', () => {
  it.each([undefined, new Date('2030-01-01T12:00:00Z')])(
    'rejects a published legacy post before any Telegram send or revision',
    async (scheduledAt) => {
      const prisma = {
        telegramManagedPost: {
          findFirst: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
        },
        telegramChannel: {
          findFirst: jest.fn().mockResolvedValue({ id: 'channel' }),
        },
      };
      const sources = { sourcesForChannel: jest.fn().mockResolvedValue([]) };
      const journal = { start: jest.fn() };
      const revision = { createManagedPostRevision: jest.fn() };
      const bot = { sendMessage: jest.fn() };
      const mtproto = { sendMessage: jest.fn() };
      const service = new TelegramManagedPostPublisherService(
        prisma as never,
        journal as never,
        mtproto as never,
        sources as never,
        bot as never,
        {} as never,
        {} as never,
        revision as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(
        service.publishManagedPost('workspace', 'channel', 'post', scheduledAt),
      ).rejects.toThrow('already published');
      expect(revision.createManagedPostRevision).not.toHaveBeenCalled();
      expect(journal.start).not.toHaveBeenCalled();
      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(mtproto.sendMessage).not.toHaveBeenCalled();
    },
  );
});

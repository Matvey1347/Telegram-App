import { TelegramSourceType } from '@prisma/client';
import {
  TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
  TELEGRAM_SYSTEM_BOT_SOURCE_ID,
  TelegramSourceAccessService,
} from './telegram-source-access.service';

describe('TelegramSourceAccessService publishing capabilities', () => {
  it('keeps the built-in production bot available for advertising posts with inline buttons', async () => {
    const prisma = {
      telegramChannelSourceAccess: {
        findMany: jest.fn().mockResolvedValue([
          {
            channelId: 'channel-1',
            sourceId: TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
            sourceType: TelegramSourceType.BOT,
            role: 'ADMIN',
            canPostMessages: true,
            canEditMessages: false,
            canDeleteMessages: false,
            canInviteUsers: false,
            canManageInviteLinks: false,
            canViewStats: false,
            rawPermissions: null,
            lastCheckedAt: new Date('2026-08-27T15:57:23.000Z'),
          },
        ]),
      },
      telegramBotIntegration: { findMany: jest.fn().mockResolvedValue([]) },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TelegramSourceAccessService(prisma as never);

    const sources = await service.sourcesForChannel('workspace-1', 'channel-1');
    expect(sources).toHaveLength(1);
    expect(sources[0]?.sourceId).toBe(TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID);
    expect(sources[0]?.sourceType).toBe(TelegramSourceType.BOT);
    expect(sources[0]?.displayName).toBe('Production system bot');
    expect(sources[0]?.permissions.canPostMessages).toBe(true);

    const capabilities = await service.publishingCapabilitiesForChannel(
      'workspace-1',
      'channel-1',
    );
    expect(capabilities.canPublishInlineButtons).toBe(true);
    expect(capabilities.source?.sourceId).toBe(
      TELEGRAM_PRODUCTION_SYSTEM_BOT_SOURCE_ID,
    );
  });

  it('keeps MTProto as the preferred source while reporting a posting bot for inline buttons', async () => {
    const prisma = {
      telegramChannelSourceAccess: {
        findMany: jest.fn().mockResolvedValue([
          {
            channelId: 'channel-1',
            sourceId: 'account-1',
            sourceType: TelegramSourceType.MTPROTO,
            canPostMessages: true,
          },
          {
            channelId: 'channel-1',
            sourceId: TELEGRAM_SYSTEM_BOT_SOURCE_ID,
            sourceType: TelegramSourceType.BOT,
            canPostMessages: true,
          },
        ]),
      },
      telegramBotIntegration: { findMany: jest.fn().mockResolvedValue([]) },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-1',
            label: 'Owner',
            username: 'owner',
            phoneMasked: null,
            firstName: 'Owner',
            lastName: null,
            photoUrl: null,
            isPremium: true,
            captionLengthMax: 2048,
            messageLengthMax: 4096,
            premiumCheckedAt: new Date('2026-08-13T12:00:00.000Z'),
            premiumCapabilities: { supportsCustomEmoji: true },
          },
        ]),
      },
    };
    const service = new TelegramSourceAccessService(prisma as never);

    const capabilities = await service.publishingCapabilitiesForChannel(
      'workspace-1',
      'channel-1',
    );

    expect(capabilities.source).toMatchObject({
      sourceId: 'account-1',
      sourceType: 'MTPROTO',
    });
    expect(capabilities.canPublishInlineButtons).toBe(true);
  });

  it('does not claim inline-button support from an MTProto-only source', async () => {
    const prisma = {
      telegramChannelSourceAccess: {
        findMany: jest.fn().mockResolvedValue([
          {
            channelId: 'channel-1',
            sourceId: 'account-1',
            sourceType: TelegramSourceType.MTPROTO,
            canPostMessages: true,
          },
        ]),
      },
      telegramBotIntegration: { findMany: jest.fn().mockResolvedValue([]) },
      telegramUserAccountIntegration: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'account-1',
            label: 'Owner',
            username: 'owner',
            phoneMasked: null,
            firstName: 'Owner',
            lastName: null,
            photoUrl: null,
            isPremium: false,
            captionLengthMax: 1024,
            messageLengthMax: 4096,
            premiumCheckedAt: null,
            premiumCapabilities: null,
          },
        ]),
      },
    };
    const service = new TelegramSourceAccessService(prisma as never);

    const capabilities = await service.publishingCapabilitiesForChannel(
      'workspace-1',
      'channel-1',
    );

    expect(capabilities.source?.sourceType).toBe('MTPROTO');
    expect(capabilities.canPublishInlineButtons).toBe(false);
  });
});

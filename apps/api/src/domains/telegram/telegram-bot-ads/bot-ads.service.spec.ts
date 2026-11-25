import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BotAdsService, buildPlacementCreative } from './bot-ads.service';
import { botAdRedirectOrigin, readBotAdCreative } from './bot-ads-read';

function fixture() {
  const id = randomUUID();
  const runtime = { id: 'runtime', username: 'campaign_bot' };
  const scope = {
    userId: 'operator',
    botIntegrationId: 'managed-bot',
    environment: 'PRODUCTION' as const,
  };
  const prisma = {
    telegramBotRuntimeInstance: {
      findFirst: jest.fn().mockResolvedValue(runtime),
    },
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({ id: 'own-channel' }),
      findMany: jest.fn(),
    },
    botAdPromo: { findUnique: jest.fn() },
    botAdLink: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const workspace = {
    requireWorkspaceRole: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'operator-workspace' }),
  };
  const publication = {
    scheduleManagedPost: jest.fn(),
    publishManagedPostNow: jest.fn(),
  };
  const drafts = {
    createManagedPost: jest.fn(),
    createManagedPostDrafts: jest.fn(),
  };
  const service = new BotAdsService(
    prisma as never,
    workspace as never,
    drafts as never,
    publication as never,
    {} as never,
    {} as never,
  );
  return { id, runtime, scope, service, prisma, publication, drafts };
}

describe('Bot Ads placements', () => {
  it('uses a direct Telegram link when the API is available only locally', () => {
    expect(botAdRedirectOrigin('http://localhost:4000')).toBeUndefined();
    expect(botAdRedirectOrigin('https://127.0.0.1')).toBeUndefined();
    expect(botAdRedirectOrigin('https://api.example')).toBe(
      'https://api.example',
    );
  });

  it('inserts the placement link into the button or appends it to text', () => {
    const url = 'https://api.example/bot-ad-links/placement';
    const button = {
      text: 'Open bot',
      url: '{{invite_link}}',
      style: 'primary',
    };
    const withButton = readBotAdCreative({
      text: 'A promo',
      buttonRows: [[button]],
    });
    expect(buildPlacementCreative(withButton, url)).toMatchObject({
      text: 'A promo',
      buttonRows: [[{ ...button, url }]],
    });
    expect(
      buildPlacementCreative(readBotAdCreative({ text: 'A promo' }), url).text,
    ).toBe(`A promo\n\n${url}`);
  });

  it('replaces web, Markdown, HTML, and button destinations while preserving media', () => {
    const url = 'https://tracking.example/placement';
    const creative = readBotAdCreative({
      text: '[read](https://old.example) <a href="https://another.example">open</a> https://bare.example/path. {{invite_link}} ![asset](https://images.example/photo.png)',
      imageUrls: ['https://images.example/photo.png'],
      buttonRows: [
        [
          {
            text: 'Open',
            url: 'tg://resolve?domain=elsewhere',
            style: 'default',
          },
        ],
      ],
    });
    expect(buildPlacementCreative(creative, url)).toMatchObject({
      text: `[read](${url}) <a href="${url}">open</a> ${url}. ${url} ![asset](https://images.example/photo.png)`,
      buttonRows: [[{ text: 'Open', url }]],
      imageUrls: creative.imageUrls,
    });
  });

  it('rejects channels outside the owned workspace before creating a placement', async () => {
    const { service, scope, prisma, drafts, id } = fixture();
    prisma.botAdLink.findUnique.mockResolvedValue(null);
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(
      service.createLink(scope, {
        id,
        title: 'Launch',
        channelId: 'other-channel',
        promoId: 'promo',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'other-channel',
        workspaceId: 'operator-workspace',
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
        OR: [{ sourceType: 'telegram' }, { sourceType: null }],
      },
      select: { id: true },
    });
    expect(drafts.createManagedPost).not.toHaveBeenCalled();
  });

  it('accepts test channels for standalone links while requiring a publishing channel for placements', async () => {
    const { service, scope, prisma, drafts, id } = fixture();
    prisma.botAdLink.findUnique.mockResolvedValue(null);
    prisma.botAdLink.create.mockResolvedValue({
      id,
      title: 'Link',
      createdAt: new Date(),
      tracked: false,
      channel: { id: 'test-channel', title: 'Test' },
    });
    await expect(
      service.createLink(scope, {
        id,
        title: 'Link',
        channelId: 'test-channel',
      }),
    ).resolves.toMatchObject({ id, channel: { id: 'test-channel' } });
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'test-channel',
        workspaceId: 'operator-workspace',
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
        OR: [{ sourceType: 'telegram' }, { sourceType: null }],
      },
      select: { id: true },
    });
    expect(drafts.createManagedPost).not.toHaveBeenCalled();
  });

  it('rejects duplicate and ineligible batch targets before creating any drafts', async () => {
    const { service, scope, prisma, drafts } = fixture();
    prisma.botAdLink.findMany.mockResolvedValue([]);
    prisma.botAdPromo.findUnique.mockResolvedValue({ post: { text: 'Promo' } });
    const first = { id: randomUUID(), channelId: 'first' };
    const second = { id: randomUUID(), channelId: 'second' };
    const request = {
      campaignId: randomUUID(),
      title: 'Launch',
      promoId: 'promo',
    };
    await expect(
      service.createPlacements(scope, { ...request, targets: [first, first] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.telegramChannel.findMany.mockResolvedValue([
      { id: first.channelId, title: 'Owned' },
    ]);
    await expect(
      service.createPlacements(scope, { ...request, targets: [first, second] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(drafts.createManagedPostDrafts).not.toHaveBeenCalled();
  });

  it('returns the existing link on a retried placement creation', async () => {
    const { service, scope, prisma, drafts, id } = fixture();
    prisma.botAdLink.findUnique.mockResolvedValue({
      id,
      title: 'Launch',
      createdAt: new Date(),
      tracked: false,
      promo: { id: 'promo', title: 'Creative' },
      channel: { id: 'own-channel', title: 'Owned' },
      publicationIntent: null,
      managedPost: null,
    });
    await expect(
      service.createLink(scope, {
        id,
        title: 'Launch',
        channelId: 'own-channel',
        promoId: 'promo',
      }),
    ).resolves.toMatchObject({ id, title: 'Launch', promo: { id: 'promo' } });
    expect(drafts.createManagedPost).not.toHaveBeenCalled();
  });

  it('reserves a single schedule and stops a competing request before Telegram publication', async () => {
    const { service, scope, prisma, publication, id, runtime } = fixture();
    const first = new Date(Date.now() + 600_000).toISOString();
    const second = new Date(Date.now() + 1_200_000).toISOString();
    const channel = { id: 'own-channel', title: 'Owned' };
    const post = {
      id: 'post',
      telegramChannelId: channel.id,
      status: 'DRAFT',
      telegramMessageUrls: [],
      scheduledAt: null,
      publishedAt: null,
      telegramPost: null,
    };
    const link = {
      id,
      title: 'Launch',
      createdAt: new Date(),
      tracked: false,
      promo: null,
      channel,
      publicationIntent: null,
      managedPost: post,
    };
    prisma.botAdLink.findUnique.mockResolvedValue(link);
    prisma.botAdLink.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.botAdLink.findUniqueOrThrow.mockResolvedValue({
      ...link,
      publicationIntent: first,
      managedPost: {
        ...post,
        status: 'SCHEDULED',
        scheduledAt: new Date(first),
      },
    });

    const outcome = await Promise.allSettled([
      service.publish(scope, id, first),
      service.publish(scope, id, second),
    ]);
    expect(outcome[0]).toMatchObject({
      status: 'fulfilled',
      value: { post: { status: 'SCHEDULED', scheduledAt: first } },
    });
    const other = outcome[1];
    expect(other.status).toBe('rejected');
    if (other.status === 'rejected')
      expect(other.reason).toBeInstanceOf(ConflictException);
    expect(publication.scheduleManagedPost).toHaveBeenCalledTimes(1);
    expect(publication.scheduleManagedPost).toHaveBeenCalledWith(
      'operator',
      channel.id,
      post.id,
      { scheduledAt: first },
    );
    expect(prisma.botAdLink.updateMany).toHaveBeenCalledWith({
      where: { id, runtimeInstanceId: runtime.id, publicationIntent: null },
      data: { publicationIntent: first },
    });
  });
});

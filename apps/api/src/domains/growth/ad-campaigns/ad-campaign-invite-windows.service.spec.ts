import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdCampaignInviteWindowsService } from './ad-campaign-invite-windows.service';

describe('AdCampaignInviteWindowsService', () => {
  const campaign = { id: 'c', workspace: { timezone: 'Europe/Kyiv' }, inviteLinks: [{ id: 'a', url: 'invite', telegramChannelId: 'channel' }] };
  let prisma: any;
  let service: AdCampaignInviteWindowsService;
  let registration: any;

  beforeEach(() => {
    prisma = {
      adCampaign: { findFirst: jest.fn().mockResolvedValue(campaign) },
      adCampaignInviteLinkWindow: {
        findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    registration = { register: jest.fn() };
    service = new AdCampaignInviteWindowsService(prisma, { resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('w') } as any, registration);
  });

  it('saves a date for the specified link', async () => {
    await service.set('user', 'c', { windows: [{ inviteLinkId: 'a', fromDate: '2026-11-12' }] });
    expect(prisma.adCampaignInviteLinkWindow.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ inviteLinkId: 'a', fromDate: '2026-11-12', timezone: 'Europe/Kyiv' }) }));
  });

  it('rejects links from another campaign and invalid calendar dates', async () => {
    await expect(service.set('user', 'c', { windows: [{ inviteLinkId: 'foreign', fromDate: '2026-11-12' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.set('user', 'c', { windows: [{ inviteLinkId: 'a', fromDate: '2026-02-30' }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not expose a campaign outside the workspace', async () => {
    prisma.adCampaign.findFirst.mockResolvedValue(null);
    await expect(service.list('user', 'c')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.adCampaign.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c', workspaceId: 'w' } }));
  });

  it('drops stale pre-campaign counts and requests only Telegram importers since the actual start', async () => {
    const startedAt = new Date('2026-11-12T12:30:00.000Z');
    prisma.adCampaign.findFirst.mockResolvedValue({ ...campaign, startedAt });
    prisma.adCampaignInviteLinkWindow.findMany.mockResolvedValue([
      { inviteLinkId: 'a', fromDate: '2026-08-19', timezone: 'Europe/Kyiv' },
    ]);
    registration.register.mockResolvedValue({ joinedWithinPeriod: 12, pendingWithinPeriod: 7 });
    expect(await service.refresh('user', 'c')).toEqual([]);
    expect(registration.register).toHaveBeenCalledWith('user', 'channel', 'invite', expect.objectContaining({ from: startedAt, includePending: true }));
    expect(prisma.adCampaignInviteLinkWindow.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ fromDate: '2026-11-12', joinedCount: null }),
    }));
  });

  it('marks results unavailable when Telegram cannot return complete counts', async () => {
    prisma.adCampaignInviteLinkWindow.findMany.mockResolvedValue([{ inviteLinkId: 'a', fromDate: '2026-11-12', timezone: 'Europe/Kyiv' }]);
    registration.register.mockResolvedValue({ joinedWithinPeriod: 10, pendingWithinPeriod: null });
    expect(await service.refresh('user', 'c')).toEqual(['a']);
    expect(prisma.adCampaignInviteLinkWindow.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ joinedCount: 10, lastAttemptStatus: 'PARTIAL' }) }));
  });
});

describe('OT-04 — refresh after ownership changes', () => {
  it.each(['permission error', 'incomplete importers'] as const)('retains an existing verified window on %s', async (failure) => {
    const window = {
      inviteLinkId: 'window-link',
      fromDate: '2026-11-12',
      timezone: 'Europe/Warsaw',
      joinedCount: 12,
      pendingCount: 3,
      computedAt: new Date('2026-11-14T12:00:00Z'),
    };
    const prisma = {
      adCampaign: { findFirst: jest.fn().mockResolvedValue({
        id: 'campaign-fixture',
        inviteLinks: [{ id: window.inviteLinkId, url: 'fixture-invite', telegramChannelId: 'fixture-channel' }],
      }) },
      adCampaignInviteLinkWindow: {
        findMany: jest.fn().mockResolvedValue([window]),
        updateMany: jest.fn(async ({ data }) => { Object.assign(window, data); return { count: 1 }; }),
      },
    };
    const register = failure === 'permission error'
      ? jest.fn().mockRejectedValue(new Error('CHAT_ADMIN_REQUIRED'))
      : jest.fn().mockResolvedValue({ joinedWithinPeriod: 12, pendingWithinPeriod: null });
    const service = new AdCampaignInviteWindowsService(prisma as never, {
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('fixture-workspace'),
    } as never, { register } as never);

    expect(await service.refresh('actor', 'campaign-fixture')).toEqual([window.inviteLinkId]);
    expect(window).toMatchObject({ joinedCount: 12, pendingCount: 3, computedAt: new Date('2026-11-14T12:00:00Z') });
  });
});

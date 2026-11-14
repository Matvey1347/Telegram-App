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
        findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn(),
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

  it('marks results unavailable when Telegram cannot return complete counts', async () => {
    prisma.adCampaignInviteLinkWindow.findMany.mockResolvedValue([{ inviteLinkId: 'a', fromDate: '2026-11-12', timezone: 'Europe/Kyiv' }]);
    registration.register.mockResolvedValue({ joinedWithinPeriod: 10, pendingWithinPeriod: null });
    expect(await service.refresh('user', 'c')).toEqual(['a']);
    expect(prisma.adCampaignInviteLinkWindow.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { joinedCount: null, pendingCount: null, computedAt: null } }));
  });
});

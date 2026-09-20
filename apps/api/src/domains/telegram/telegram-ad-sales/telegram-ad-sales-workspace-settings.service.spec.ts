import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { TelegramAdSalesWorkspaceSettingsService } from './telegram-ad-sales-workspace-settings.service';

const settings = {
  id: 'settings-1',
  workspaceId: 'workspace-1',
  salesCommissionEnabled: true,
  defaultSalesCommissionRate: 12.5,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-12T00:00:00.000Z'),
};

function createService(role: WorkspaceRole = WorkspaceRole.owner) {
  const prisma = {
    telegramAdSalesWorkspaceSettings: {
      findUnique: jest.fn().mockResolvedValue(settings),
      create: jest.fn(),
      upsert: jest.fn().mockResolvedValue(settings),
    },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
    resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({
      id: 'member-1',
      workspaceId: 'workspace-1',
      role,
    }),
  };
  const service = new TelegramAdSalesWorkspaceSettingsService(
    prisma as never,
    workspaceService as never,
  );
  return { service, prisma };
}

describe('TelegramAdSalesWorkspaceSettingsService', () => {
  it('lets an owner enable the default commission', async () => {
    const { service, prisma } = createService();

    const result = await service.update('owner-1', {
      salesCommissionEnabled: true,
      defaultSalesCommissionRate: 12.5,
    });

    expect(prisma.telegramAdSalesWorkspaceSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1' },
        update: {
          salesCommissionEnabled: true,
          defaultSalesCommissionRate: 12.5,
        },
      }),
    );
    expect(result.defaultSalesCommissionRate).toBe(12.5);
  });

  it('does not let a non-owner change commission settings', async () => {
    const { service, prisma } = createService(WorkspaceRole.member);

    await expect(
      service.update('member-user-1', { salesCommissionEnabled: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      prisma.telegramAdSalesWorkspaceSettings.upsert,
    ).not.toHaveBeenCalled();
  });
});

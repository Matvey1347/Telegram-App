import { NotFoundException } from '@nestjs/common';
import { TelegramAdSalesDraftsService } from './telegram-ad-sales-drafts.service';

describe('TelegramAdSalesDraftsService', () => {
  const prisma = {
    telegramAdSaleDraft: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const workspaceService = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const service = new TelegramAdSalesDraftsService(
    prisma as never,
    workspaceService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('stores a workspace-scoped form snapshot without creating a sale', async () => {
    prisma.telegramAdSaleDraft.findFirst.mockResolvedValue(null);
    prisma.telegramAdSaleDraft.create.mockResolvedValue({ id: 'draft-1' });
    await expect(
      service.create('user-1', { title: 'Client', payload: { placements: [] } }),
    ).resolves.toEqual({ id: 'draft-1' });
    expect(prisma.telegramAdSaleDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          createdByUserId: 'user-1',
          payload: { placements: [] },
        }),
      }),
    );
  });

  it('returns only the latest saved form as the current draft', async () => {
    prisma.telegramAdSaleDraft.findMany.mockResolvedValue([{ id: 'draft-2' }]);
    await expect(service.list('user-1')).resolves.toEqual([{ id: 'draft-2' }]);
    expect(prisma.telegramAdSaleDraft.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', createdByUserId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });
  });

  it('updates the current draft instead of creating another draft record', async () => {
    prisma.telegramAdSaleDraft.findFirst.mockResolvedValue({ id: 'draft-1' });
    prisma.telegramAdSaleDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.telegramAdSaleDraft.findUniqueOrThrow.mockResolvedValue({
      id: 'draft-1',
      payload: { placements: [{ channelId: 'channel-2' }] },
    });

    await expect(
      service.create('user-1', {
        title: 'Updated client',
        payload: { placements: [{ channelId: 'channel-2' }] },
      }),
    ).resolves.toMatchObject({ id: 'draft-1' });
    expect(prisma.telegramAdSaleDraft.create).not.toHaveBeenCalled();
    expect(prisma.telegramAdSaleDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'draft-1',
          workspaceId: 'workspace-1',
          createdByUserId: 'user-1',
        },
      }),
    );
  });

  it('rejects deletion of a draft outside the current user workspace', async () => {
    prisma.telegramAdSaleDraft.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('user-1', 'other-draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

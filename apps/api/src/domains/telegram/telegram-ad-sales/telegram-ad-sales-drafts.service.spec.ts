import { NotFoundException } from '@nestjs/common';
import { TelegramAdSalesDraftsService } from './telegram-ad-sales-drafts.service';

describe('TelegramAdSalesDraftsService', () => {
  const prisma = {
    telegramAdSaleDraft: {
      findMany: jest.fn(),
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

  it('rejects deletion of a draft outside the current user workspace', async () => {
    prisma.telegramAdSaleDraft.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.delete('user-1', 'other-draft')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

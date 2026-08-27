import { TelegramManagedPostImportParserService } from './telegram-managed-post-import-parser.service';

function createService() {
  const prisma = {
    icon: {
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };
  return {
    prisma,
    service: new TelegramManagedPostImportParserService(prisma as never),
  };
}

describe('TelegramManagedPostImportParserService icon resolution', () => {
  it('reuses a shared emoji without renaming it to the imported post title', async () => {
    const { prisma, service } = createService();
    prisma.icon.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ukraine-icon' });

    await expect(
      service.resolveManagedPostImportIconId(
        'workspace-1',
        'user-1',
        '🇺🇦',
        'Reface змінив назву вже на зльоті',
      ),
    ).resolves.toBe('ukraine-icon');

    expect(prisma.icon.update).not.toHaveBeenCalled();
    expect(prisma.icon.upsert).not.toHaveBeenCalled();
  });

  it('keeps an explicit icon id without emoji lookup or mutation', async () => {
    const { prisma, service } = createService();
    prisma.icon.findFirst.mockResolvedValueOnce({ id: 'explicit-icon' });

    await expect(
      service.resolveManagedPostImportIconId(
        'workspace-1',
        'user-1',
        'explicit-icon',
        'Imported post',
      ),
    ).resolves.toBe('explicit-icon');

    expect(prisma.icon.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.icon.update).not.toHaveBeenCalled();
    expect(prisma.icon.upsert).not.toHaveBeenCalled();
  });

  it('creates or updates the title icon only when the emoji is not reusable', async () => {
    const { prisma, service } = createService();
    prisma.icon.findFirst.mockResolvedValue(null);
    prisma.icon.upsert.mockResolvedValue({ id: 'new-icon' });

    await expect(
      service.resolveManagedPostImportIconId(
        'workspace-1',
        'user-1',
        '🆕',
        'New imported post',
      ),
    ).resolves.toBe('new-icon');

    expect(prisma.icon.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_type_name: {
            workspaceId: 'workspace-1',
            type: 'emoji',
            name: 'New imported post',
          },
        },
      }),
    );
  });
});

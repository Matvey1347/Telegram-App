import { ForbiddenException } from '@nestjs/common';
import { TelegramCrmLegacyAuthorizationService } from './telegram-crm-legacy-authorization.service';

function createService(
  ownership: Record<string, never> | { assignedMemberId: string },
) {
  const prisma = {
    telegramAdvertiser: { findFirst: jest.fn() },
    telegramAdvertiserContact: { findFirst: jest.fn() },
    telegramAdvertiserTask: { findFirst: jest.fn() },
    workspaceMember: { findFirst: jest.fn() },
  };
  const authorization = {
    require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
    scope: jest.fn().mockResolvedValue(ownership),
  };
  return {
    service: new TelegramCrmLegacyAuthorizationService(
      prisma as never,
      authorization as never,
    ),
    prisma,
    authorization,
  };
}

describe('TelegramCrmLegacyAuthorizationService', () => {
  it('enforces view-own scope for legacy Contact lists', async () => {
    const { service } = createService({ assignedMemberId: 'member-1' });

    await expect(service.readScope('user-1')).resolves.toEqual({
      workspaceId: 'workspace-1',
      ownerMemberId: 'member-1',
    });
  });

  it('rejects editing a Contact owned by another Member', async () => {
    const { service, prisma } = createService({
      assignedMemberId: 'member-1',
    });
    prisma.telegramAdvertiser.findFirst.mockResolvedValue({
      ownerMemberId: 'member-2',
    });

    await expect(
      service.requireEditContact('user-1', 'contact-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates an edit-all owner assignment inside the workspace', async () => {
    const { service, prisma } = createService({});
    prisma.workspaceMember.findFirst.mockResolvedValue(null);

    await expect(
      service.createContactContext('user-1', 'foreign-member'),
    ).rejects.toThrow('Contact owner is not in workspace');
    expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-member', workspaceId: 'workspace-1' },
      select: { id: true },
    });
  });

  it('keeps legacy Contact details inside the authorized Contact', async () => {
    const { service, prisma } = createService({
      assignedMemberId: 'member-1',
    });
    prisma.telegramAdvertiser.findFirst.mockResolvedValue({
      ownerMemberId: 'member-1',
    });
    prisma.telegramAdvertiserContact.findFirst.mockResolvedValue(null);

    await expect(
      service.requireContactDetail('user-1', 'contact-1', 'foreign-detail'),
    ).rejects.toThrow('Telegram advertiser contact not found');
    expect(prisma.telegramAdvertiserContact.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-detail',
        workspaceId: 'workspace-1',
        advertiserId: 'contact-1',
      },
      select: { id: true },
    });
  });

  it('scopes legacy task mutations through Contact ownership', async () => {
    const { service, prisma } = createService({
      assignedMemberId: 'member-1',
    });
    prisma.telegramAdvertiserTask.findFirst.mockResolvedValue(null);

    await expect(service.requireEditTask('user-1', 'task-2')).rejects.toThrow(
      'Telegram advertiser task not found',
    );
    expect(prisma.telegramAdvertiserTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-2',
        workspaceId: 'workspace-1',
        advertiser: { ownerMemberId: 'member-1' },
      },
    });
  });
});

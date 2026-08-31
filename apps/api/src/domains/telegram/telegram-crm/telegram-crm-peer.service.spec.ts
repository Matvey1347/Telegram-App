import { TelegramCrmPeerService } from './telegram-crm-peer.service';

const peer = (overrides: Record<string, unknown> = {}) => ({
  id: 'peer-1',
  workspaceId: 'workspace-1',
  telegramUserId: '123456',
  contactId: 'contact-1',
  username: 'old_name',
  firstName: null,
  lastName: null,
  photoUrl: null,
  createdAt: new Date('2026-09-01T08:00:00.000Z'),
  updatedAt: new Date('2026-09-01T08:00:00.000Z'),
  ...overrides,
});

describe('TelegramCrmPeerService', () => {
  it('uses workspace + telegramUserId identity and updates a changed username without creating a duplicate', async () => {
    const tx = {
      telegramAdvertiser: {
        findFirst: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
      telegramCrmPeer: {
        findUnique: jest.fn().mockResolvedValue(peer()),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(peer({ username: 'new_name' })),
      },
      telegramCrmConversation: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
    };
    const service = new TelegramCrmPeerService(
      prisma as never,
      authorization as never,
    );

    const result = await service.upsert('user-1', {
      telegramUserId: '123456',
      username: '@New_Name',
    });

    expect(tx.telegramCrmPeer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_telegramUserId: {
            workspaceId: 'workspace-1',
            telegramUserId: '123456',
          },
        },
      }),
    );
    expect(tx.telegramCrmPeer.create).not.toHaveBeenCalled();
    expect(tx.telegramCrmPeer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { username: 'new_name' } }),
    );
    expect(result.username).toBe('new_name');
  });

  it('performs zero writes when mutable identity attributes did not change', async () => {
    const tx = {
      telegramAdvertiser: { findFirst: jest.fn() },
      telegramCrmPeer: {
        findUnique: jest.fn().mockResolvedValue(peer()),
        create: jest.fn(),
        update: jest.fn(),
      },
      telegramCrmConversation: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const service = new TelegramCrmPeerService(
      prisma as never,
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      } as never,
    );

    await service.upsert('user-1', {
      telegramUserId: '123456',
      username: 'old_name',
    });

    expect(tx.telegramCrmPeer.create).not.toHaveBeenCalled();
    expect(tx.telegramCrmPeer.update).not.toHaveBeenCalled();
    expect(tx.telegramCrmConversation.updateMany).not.toHaveBeenCalled();
  });
});

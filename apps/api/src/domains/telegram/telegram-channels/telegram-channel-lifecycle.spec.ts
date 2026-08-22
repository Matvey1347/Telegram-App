import { TelegramChannelsService } from './telegram-channels.service';
import {
  createTelegramChannelsTestHarness,
  type TelegramChannelsTestHarness,
} from './__fixtures__/telegram-channels.test-harness';

describe('TelegramChannelsService channel lifecycle', () => {
  const prisma = { telegramChannel: { updateMany: jest.fn() } };
  const workspaceService = { resolveWorkspaceIdForUser: jest.fn() };
  const service = createTelegramChannelsTestHarness(
    prisma as never,
    workspaceService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    workspaceService.resolveWorkspaceIdForUser.mockResolvedValue('workspace-1');
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'channel-1',
      archivedAt: null,
    } as never);
  });

  it('archives through a workspace-scoped conditional write without deleting data', async () => {
    prisma.telegramChannel.updateMany.mockResolvedValue({ count: 1 });

    await service.archive('user-1', 'channel-1');

    expect(prisma.telegramChannel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'channel-1',
          workspaceId: 'workspace-1',
          archivedAt: null,
        },
        data: { archivedAt: expect.any(Date) },
      }),
    );
  });

  it('does not write when archive is repeated', async () => {
    prisma.telegramChannel.updateMany.mockResolvedValue({ count: 0 });

    await service.archive('user-1', 'channel-1');

    expect(prisma.telegramChannel.updateMany).toHaveBeenCalledTimes(1);
  });

  it('restores through a workspace-scoped conditional write', async () => {
    prisma.telegramChannel.updateMany.mockResolvedValue({ count: 1 });

    await service.restore('user-1', 'channel-1');

    expect(prisma.telegramChannel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'channel-1',
          workspaceId: 'workspace-1',
          archivedAt: { not: null },
        },
        data: { archivedAt: null },
      }),
    );
  });

  it('does not write when restore is repeated', async () => {
    prisma.telegramChannel.updateMany.mockResolvedValue({ count: 0 });

    await service.restore('user-1', 'channel-1');

    expect(prisma.telegramChannel.updateMany).toHaveBeenCalledTimes(1);
  });
});

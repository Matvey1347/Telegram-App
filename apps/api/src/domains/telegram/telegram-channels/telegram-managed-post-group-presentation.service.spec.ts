import { TelegramManagedPostGroupPresentationService } from './telegram-managed-post-group-presentation.service';

describe('TelegramManagedPostGroupPresentationService system groups', () => {
  const prisma = {
    icon: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new TelegramManagedPostGroupPresentationService(
    prisma as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.icon.findFirst.mockResolvedValue({ id: 'telegram-logo' });
    prisma.icon.findMany.mockResolvedValue([]);
  });

  it('presents the service logo and money emoji for their system groups', async () => {
    const groups = await service.attachPostGroupIcons([
      {
        id: 'system-bot',
        workspaceId: 'workspace-1',
        icon: null,
        isSystem: true,
        systemKey: 'SYSTEM_BOT_POSTS',
        title: 'System Bot posts',
      },
      {
        id: 'advertise',
        workspaceId: 'workspace-1',
        icon: '💰',
        isSystem: true,
        systemKey: 'ADVERTISE',
        title: 'Advertise',
      },
    ]);

    expect(groups[0]?.iconPresentation).toMatchObject({
      type: 'image',
      url: '/brand/telegram-system.png',
    });
    expect(groups[1]?.iconPresentation).toMatchObject({
      type: 'unicode',
      value: '💰',
    });
    expect(prisma.icon.findFirst).not.toHaveBeenCalled();
  });
});

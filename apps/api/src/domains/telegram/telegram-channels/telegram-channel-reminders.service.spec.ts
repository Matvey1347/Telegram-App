import { TelegramChannelRemindersService } from './telegram-channel-reminders.service';

describe('channel reminder configuration', () => {
  function setup() {
    const tx = {
      telegramChannel: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([
          { id: 'a', assignedMemberId: 'member' },
          { id: 'b', assignedMemberId: 'member' },
        ]),
        updateMany: jest.fn(),
      },
      telegramChannelReminderTemplate: {
        findFirst: jest.fn().mockResolvedValue({ id: 'template' }),
        count: jest.fn().mockResolvedValue(1),
      },
      telegramChannelReminderAssignment: {
        createMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      workspaceMember: {
        findFirst: jest.fn().mockResolvedValue({ id: 'member' }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (fn) => fn(tx)),
      icon: { findFirst: jest.fn().mockResolvedValue(null) },
      telegramChannelReminderTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "template", name: "Reminder", iconId: "icon", icon: { id: "icon", type: "emoji", emoji: "🔔", imageUrl: null }, daysBefore: [1], notifyEmpty: false }),
      },
      telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const workspace = {
      requireWorkspaceRole: jest
        .fn()
        .mockResolvedValue({ workspaceId: 'workspace' }),
      resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace'),
    };
    const authorization = { require: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }) };
    return {
      authorization,
      tx,
      prisma,
      workspace,
      service: new TelegramChannelRemindersService(
        prisma as never,
        workspace as never,
        authorization as never,
      ),
    };
  }
  it('persists an available icon and returns its resolved presentation', async () => {
    const { service, prisma } = setup();
    prisma.icon.findFirst.mockResolvedValue({ id: 'icon' });
    const result = await service.create('user', { name: 'Reminder', iconId: 'icon', daysBefore: [1], notifyEmpty: false });
    expect(prisma.telegramChannelReminderTemplate.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'workspace', iconId: 'icon' }) }));
    expect(result.iconPresentation).toEqual(expect.objectContaining({ type: 'unicode', value: '🔔' }));
  });
  it('rejects an icon from another workspace', async () => {
    const { service, prisma } = setup();
    await expect(service.create('user', { name: 'Reminder', iconId: 'outside', daysBefore: [1], notifyEmpty: false })).rejects.toThrow('Icon is unavailable in this workspace');
    expect(prisma.icon.findFirst).toHaveBeenCalledWith({ where: { id: 'outside', OR: [{ workspaceId: 'workspace' }, { workspaceId: null }] }, select: { id: true } });
  });
  it('rejects reads without channel access', async () => {
    const { service, authorization, prisma } = setup();
    authorization.require.mockRejectedValue(new Error('forbidden'));
    await expect(service.list('user')).rejects.toThrow('forbidden');
    expect(prisma.telegramChannel.findMany).not.toHaveBeenCalled();
  });
  it('assigns a workspace template and member to the selected channels in one transaction', async () => {
    const { service, tx } = setup();
    tx.telegramChannel.findMany.mockResolvedValue([
      { id: 'a', assignedMemberId: null },
      { id: 'b', assignedMemberId: null },
    ]);
    await service.assign('user', {
      channelIds: ['a', 'b'],
      templateId: 'template',
      memberId: 'member',
    });
    expect(tx.telegramChannel.updateMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace', id: { in: ['a', 'b'] } },
      data: { assignedMemberId: 'member' },
    });
    expect(
      tx.telegramChannelReminderAssignment.createMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        skipDuplicates: true,
        data: expect.arrayContaining([
          expect.objectContaining({
            workspaceId: 'workspace',
            channelId: 'a',
            templateId: 'template',
          }),
        ]),
      }),
    );
  });
  it('rejects channels outside the current workspace before changing any assignments', async () => {
    const { service, tx } = setup();
    tx.telegramChannel.count.mockResolvedValue(1);
    await expect(
      service.assign('user', {
        channelIds: ['a', 'outside'],
        templateId: 'template',
      }),
    ).rejects.toThrow('One or more channels not found');
    expect(
      tx.telegramChannelReminderAssignment.createMany,
    ).not.toHaveBeenCalled();
  });
  it('rejects a member from a different workspace', async () => {
    const { service, tx } = setup();
    tx.workspaceMember.findFirst.mockResolvedValue(null);
    tx.workspaceMember.count.mockResolvedValue(0);
    await expect(
      service.assign('user', {
        channelIds: ['a', 'b'],
        templateId: 'template',
        memberId: 'outside',
      }),
    ).rejects.toThrow('Workspace member not found');
    expect(tx.telegramChannel.updateMany).not.toHaveBeenCalled();
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TelegramCrmInboxFollowUpService } from './telegram-crm-inbox-follow-up.service';

function setup() {
  const conversation = {
    id: 'conversation-a',
    workspaceId: 'workspace-a',
    contactId: 'client-a',
    state: 'ACTIVE',
    contact: {
      ownerMemberId: 'member-a',
      archivedAt: null,
      manualSalesStatus: null,
    },
  };
  const prisma = {
    telegramCrmConversation: {
      findFirst: jest.fn().mockResolvedValue(conversation),
    },
    telegramAdvertiserTask: {
      findFirst: jest.fn().mockResolvedValue({ id: 'task-a', status: 'OPEN' }),
    },
  };
  const authorization = {
    require: jest.fn().mockResolvedValue({
      workspaceId: 'workspace-a',
      memberId: 'member-current',
    }),
    requireOwnOrAny: jest.fn().mockResolvedValue(undefined),
  };
  const tasks = { create: jest.fn(), update: jest.fn(), complete: jest.fn() };
  const service = new TelegramCrmInboxFollowUpService(
    prisma as never,
    authorization as never,
    tasks as never,
  );
  return { service, prisma, authorization, tasks, conversation };
}
const at = '2030-04-08T15:00:00.000Z';

describe('Inbox follow-up adapter', () => {
  it('creates a canonical follow-up for the exact workspace/client conversation and owner', async () => {
    const { service, tasks, authorization, prisma } = setup();
    await service.schedule('user-a', 'conversation-a', {
      at,
      title: ' Ask about the package ',
    });
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conversation-a', workspaceId: 'workspace-a' },
      }),
    );
    expect(authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user-a',
      { assignedMemberId: 'member-a' },
      'adSales.crm.editOwn',
      'adSales.crm.editAny',
    );
    expect(tasks.create).toHaveBeenCalledWith('user-a', 'client-a', {
      type: 'FOLLOW_UP',
      title: 'Ask about the package',
      assignedMemberId: 'member-a',
      dueAt: at,
      metadata: { conversationId: 'conversation-a' },
    });
  });
  it.each(['CLOSED', 'DO_NOT_CONTACT', 'ARCHIVED', 'UNLINKED'])(
    'does not schedule %s',
    async (state) => {
      const { service, prisma, tasks, conversation } = setup();
      prisma.telegramCrmConversation.findFirst.mockResolvedValue({
        ...conversation,
        ...(state === 'ARCHIVED' ? { state } : {}),
        ...(state === 'UNLINKED'
          ? { contactId: null, contact: null }
          : { contact: { ...conversation.contact, manualSalesStatus: state } }),
      });
      await expect(
        service.schedule('user-a', 'conversation-a', { at }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tasks.create).not.toHaveBeenCalled();
    },
  );
  it('rejects own-only access to another client before changing tasks', async () => {
    const { service, authorization, tasks } = setup();
    authorization.requireOwnOrAny.mockRejectedValue(new ForbiddenException());
    await expect(
      service.schedule('user-a', 'conversation-a', { at }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tasks.create).not.toHaveBeenCalled();
  });
  it('requires an existing linked task in the current workspace', async () => {
    const { service, prisma, tasks } = setup();
    prisma.telegramAdvertiserTask.findFirst.mockResolvedValue(null);
    await expect(
      service.act('user-a', 'conversation-a', 'foreign-task', {
        action: 'CANCEL',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramAdvertiserTask.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-task',
        workspaceId: 'workspace-a',
        advertiserId: 'client-a',
      },
      select: { id: true, status: true },
    });
    expect(tasks.update).not.toHaveBeenCalled();
  });
  it('reschedules, snoozes, cancels and completes through existing task commands', async () => {
    const { service, tasks } = setup();
    await service.act('user-a', 'conversation-a', 'task-a', {
      action: 'RESCHEDULE',
      at,
    });
    expect(tasks.update).toHaveBeenLastCalledWith('user-a', 'task-a', {
      dueAt: at,
      remindAt: null,
      snoozedUntil: null,
    });
    await service.act('user-a', 'conversation-a', 'task-a', {
      action: 'SNOOZE',
      at,
    });
    expect(tasks.update).toHaveBeenLastCalledWith('user-a', 'task-a', {
      snoozedUntil: at,
    });
    await service.act('user-a', 'conversation-a', 'task-a', {
      action: 'CANCEL',
    });
    expect(tasks.update).toHaveBeenLastCalledWith('user-a', 'task-a', {
      status: 'CANCELLED',
    });
    await service.act('user-a', 'conversation-a', 'task-a', {
      action: 'COMPLETE',
    });
    expect(tasks.complete).toHaveBeenCalledWith('user-a', 'task-a', {});
  });
  it('rejects invalid dates and terminal reschedule without a write', async () => {
    const { service, tasks, prisma } = setup();
    await expect(
      service.schedule('user-a', 'conversation-a', { at: 'invalid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.telegramAdvertiserTask.findFirst.mockResolvedValue({
      id: 'task-a',
      status: 'COMPLETED',
    });
    await expect(
      service.act('user-a', 'conversation-a', 'task-a', {
        action: 'SNOOZE',
        at,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tasks.update).not.toHaveBeenCalled();
  });
});

describe('Inbox follow-up read/edit intersection', () => {
  it('rejects editAny plus viewOwn for a foreign contact before a command writes', async () => {
    const { service, authorization, tasks } = setup();
    authorization.requireOwnOrAny.mockImplementation(
      (_user: string, _entity: unknown, ownKey: string) =>
        ownKey === 'adSales.crm.viewOwn'
          ? Promise.reject(new ForbiddenException('Cannot view this client'))
          : Promise.resolve(undefined),
    );
    await expect(
      service.schedule('user-a', 'conversation-a', { at }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tasks.create).not.toHaveBeenCalled();
  });
});

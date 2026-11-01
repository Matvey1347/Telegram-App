import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type TelegramAdvertiserTask } from '@prisma/client';
import { TelegramAdSalesCrmTasksService } from './telegram-ad-sales-crm-tasks.service';
import {
  loadNextCrmFollowUp,
  syncCrmContactReminder,
} from './telegram-ad-sales-crm-task-schedule';

const at = new Date('2030-02-10T10:00:00Z');
const initial: TelegramAdvertiserTask = {
  manualOperationId: null,
  manualRequestFingerprint: null,
  id: 'task-a',
  workspaceId: 'workspace-a',
  advertiserId: 'client-a',
  saleId: null,
  placementId: null,
  assignedMemberId: 'member-a',
  createdByUserId: 'user-a',
  type: 'FOLLOW_UP',
  status: 'OPEN',
  priority: 'NORMAL',
  title: 'Check package availability',
  description: null,
  dueAt: at,
  remindAt: null,
  completedAt: null,
  skippedAt: null,
  snoozedUntil: null,
  completionNote: null,
  automationRuleId: null,
  metadata: null,
  createdAt: at,
  updatedAt: at,
};
function setup() {
  let task = { ...initial };
  const contact = {
    id: 'client-a',
    archivedAt: null,
    manualSalesStatus: null,
    ownerMemberId: 'member-a',
    nextContactAt: at,
  };
  const tx = {
    $queryRaw: jest.fn((sql: Prisma.Sql) =>
      Promise.resolve(sql.sql.includes('SELECT task.*') ? [task] : [contact]),
    ),
    $executeRaw: jest.fn().mockResolvedValue(1),
    workspaceMember: {
      findFirst: jest.fn().mockResolvedValue({ id: 'member-a' }),
    },
    telegramAdvertiser: { findFirst: jest.fn().mockResolvedValue(contact) },
    telegramAdSale: {
      findFirst: jest.fn().mockResolvedValue({ id: 'sale-a' }),
    },
    telegramAdSalePlacement: {
      findFirst: jest.fn().mockResolvedValue({ id: 'placement-a' }),
    },
    telegramCrmConversation: {
      findFirst: jest.fn().mockResolvedValue({ id: 'conversation-a' }),
    },
    telegramAdvertiserTask: {
      findFirst: jest.fn().mockImplementation(() => Promise.resolve(task)),
      create: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: Partial<TelegramAdvertiserTask> }) => {
            task = { ...initial, ...data };
            return Promise.resolve(task);
          },
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({ data }: { data: Partial<TelegramAdvertiserTask> }) => {
            task = { ...task, ...data };
            return Promise.resolve(task);
          },
        ),
    },
    telegramAdvertiserActivity: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    ),
    telegramAdvertiser: tx.telegramAdvertiser,
  };
  const notifications = {
    refreshTask: jest.fn(),
    dueWorkChanged: jest.fn(),
    dismissPublishedTask: jest.fn().mockResolvedValue(['member-a']),
    invalidateVisibility: jest.fn(),
  };
  const service = new TelegramAdSalesCrmTasksService(
    prisma as never,
    {
      resolveWorkspaceIdForUser: () => Promise.resolve('workspace-a'),
    } as never,
    notifications as never,
  );
  return {
    service,
    tx,
    notifications,
    setTask: (patch: Partial<TelegramAdvertiserTask>) => {
      task = { ...task, ...patch };
    },
  };
}

describe('canonical CRM reminder lifecycle', () => {
  it('does no business, notification or audit write for an unchanged update', async () => {
    const { service, tx, notifications } = setup();
    const result = await service.update('user-a', 'task-a', {
      title: ' Check package availability ',
      dueAt: at.toISOString(),
      remindAt: null,
      snoozedUntil: null,
      status: 'OPEN',
    });
    expect(result.dueAt).toBe(at.toISOString());
    expect(tx.telegramAdvertiserTask.update).not.toHaveBeenCalled();
    expect(tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(notifications.refreshTask).not.toHaveBeenCalled();
    expect(notifications.dismissPublishedTask).not.toHaveBeenCalled();
    expect(notifications.dueWorkChanged).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.map(([sql]) => sql.sql).join(' ')).toContain(
      'FOR UPDATE',
    );
  });
  it('reschedules, snoozes and cancels one task through existing notification intents', async () => {
    const { service, tx, notifications } = setup();
    const later = new Date(at.getTime() + 86_400_000).toISOString();
    expect(
      (
        await service.update('user-a', 'task-a', {
          dueAt: later,
          remindAt: null,
          snoozedUntil: null,
        })
      ).dueAt,
    ).toBe(later);
    expect(
      (
        await service.snooze('user-a', 'task-a', {
          snoozedUntil: '2030-02-12T10:00:00.000Z',
        })
      ).snoozedUntil,
    ).toBe('2030-02-12T10:00:00.000Z');
    expect(
      (await service.update('user-a', 'task-a', { status: 'CANCELLED' }))
        .status,
    ).toBe('CANCELLED');
    await service.update('user-a', 'task-a', { status: 'CANCELLED' });
    expect(tx.telegramAdvertiserTask.update).toHaveBeenCalledTimes(3);
    expect(notifications.refreshTask).toHaveBeenCalledTimes(3);
    expect(notifications.dueWorkChanged).toHaveBeenCalledTimes(3);
    expect(notifications.invalidateVisibility).toHaveBeenCalledWith(
      'workspace-a',
      ['member-a'],
    );
  });
  it.each(['COMPLETED', 'SKIPPED'] as const)(
    'repeats %s without creating more activities or refreshing due work',
    async (status) => {
      const { service, tx, notifications } = setup();
      const finish = () =>
        status === 'COMPLETED'
          ? service.complete('user-a', 'task-a', {})
          : service.skip('user-a', 'task-a', {});
      await finish();
      await finish();
      expect(tx.telegramAdvertiserTask.update).toHaveBeenCalledTimes(1);
      expect(tx.telegramAdvertiserActivity.create).toHaveBeenCalledTimes(1);
      expect(notifications.refreshTask).toHaveBeenCalledTimes(1);
    },
  );
  it('can cancel a reminder even after its historical origin conversation was removed', async () => {
    const { service, tx, setTask } = setup();
    setTask({ metadata: { conversationId: 'removed-origin' } });
    tx.telegramCrmConversation.findFirst.mockResolvedValue(null);
    expect(
      (await service.update('user-a', 'task-a', { status: 'CANCELLED' }))
        .status,
    ).toBe('CANCELLED');
    expect(tx.telegramAdvertiserTask.update).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmConversation.findFirst).not.toHaveBeenCalled();
  });
  it('does not complete a cancelled reminder', async () => {
    const { service, setTask, tx } = setup();
    setTask({ status: 'CANCELLED' });
    await expect(
      service.complete('user-a', 'task-a', {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.telegramAdvertiserTask.update).not.toHaveBeenCalled();
  });
  it.each(['member', 'sale', 'placement', 'conversation'])(
    'rejects a foreign %s link before creation',
    async (link) => {
      const { service, tx } = setup();
      if (link === 'member')
        tx.workspaceMember.findFirst.mockResolvedValue(null);
      if (link === 'sale') tx.telegramAdSale.findFirst.mockResolvedValue(null);
      if (link === 'placement')
        tx.telegramAdSalePlacement.findFirst.mockResolvedValue(null);
      if (link === 'conversation')
        tx.telegramCrmConversation.findFirst.mockResolvedValue(null);
      await expect(
        service.create('user-a', 'client-a', {
          type: 'FOLLOW_UP',
          title: 'Check status',
          assignedMemberId: 'member-a',
          dueAt: at.toISOString(),
          saleId: 'sale-a',
          placementId: 'placement-a',
          metadata: { conversationId: 'conversation-a' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.telegramAdvertiserTask.create).not.toHaveBeenCalled();
      expect(tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
    },
  );
  it('does not duplicate an identical Inbox schedule', async () => {
    const { service, tx, notifications } = setup();
    const result = await service.create('user-a', 'client-a', {
      type: 'FOLLOW_UP',
      title: initial.title,
      assignedMemberId: 'member-a',
      dueAt: at.toISOString(),
      metadata: { conversationId: 'conversation-a' },
    });
    expect(result.id).toBe('task-a');
    expect(tx.telegramAdvertiserTask.create).not.toHaveBeenCalled();
    expect(notifications.dueWorkChanged).not.toHaveBeenCalled();
  });
  it.each(['CLOSED', 'DO_NOT_CONTACT'])(
    'rejects %s clients inside the locked canonical create transaction',
    async (status) => {
      const { service, tx } = setup();
      tx.telegramAdvertiser.findFirst.mockResolvedValue({
        id: 'client-a',
        ownerMemberId: 'member-a',
        archivedAt: null,
        manualSalesStatus: status,
        nextContactAt: at,
      });
      await expect(
        service.create('user-a', 'client-a', {
          type: 'FOLLOW_UP',
          title: 'Follow up',
          assignedMemberId: 'member-a',
          dueAt: at.toISOString(),
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.telegramAdvertiserTask.create).not.toHaveBeenCalled();
    },
  );
});

describe('effective current follow-up occurrence', () => {
  it('orders snoozed/reminder/due occurrences at the database and skips unchanged compact writes', async () => {
    const task = { ...initial, snoozedUntil: new Date('2030-03-01T08:00:00Z') };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([task]),
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    expect(
      (await loadNextCrmFollowUp(tx as never, 'workspace-a', 'client-a'))?.id,
    ).toBe('task-a');
    await syncCrmContactReminder(tx as never, 'workspace-a', 'client-a');
    const select = (tx.$queryRaw.mock.calls[0] as unknown[])[0] as Prisma.Sql;
    const update = (tx.$executeRaw.mock.calls[0] as unknown[])[0] as Prisma.Sql;
    expect(select.sql).toContain(
      'COALESCE(task."snoozedUntil", task."remindAt", task."dueAt")',
    );
    expect(select.sql).toContain('LIMIT 1');
    expect(update.sql).toContain('IS DISTINCT FROM');
    expect(update.values).toContain(task.snoozedUntil);
    expect(update.values).toContain('workspace-a');
  });
});

describe('locked canonical task ownership', () => {
  it('rechecks both current read and edit ownership before a no-op can disclose a task', async () => {
    const contact = { id: 'client-a', ownerMemberId: 'new-owner' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([contact]),
      telegramAdvertiserTask: {
        findFirst: jest.fn().mockResolvedValue(initial),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
        work(tx),
      ),
    };
    const authorization = {
      requireOwnOrAny: jest
        .fn()
        .mockRejectedValue(new BadRequestException('Ownership changed')),
    };
    const service = new TelegramAdSalesCrmTasksService(
      prisma as never,
      {
        resolveWorkspaceIdForUser: () => Promise.resolve('workspace-a'),
      } as never,
      {} as never,
      undefined,
      undefined,
      authorization as never,
    );
    await expect(
      service.update('user-a', 'task-a', { title: initial.title }),
    ).rejects.toThrow('Ownership changed');
    expect(authorization.requireOwnOrAny).toHaveBeenCalledWith(
      'user-a',
      { assignedMemberId: 'new-owner' },
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    expect(tx.telegramAdvertiserTask.update).not.toHaveBeenCalled();
  });
});

describe('manual Instagram follow-up operation receipt', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2030-02-10T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());
  it('creates once without a Telegram conversation and rejects key reuse with another date', async () => {
    const f = setup();
    const operationId = '2030-02-10:6bc30dd6-05c7-4f2c-a4a8-4e9f7efde002';
    let receipt: unknown = null;
    Object.assign(f.tx, {
      telegramAdvertiserContact: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ig' }),
      },
    });
    Object.assign(f.tx.telegramAdvertiserTask, {
      findUnique: jest.fn().mockImplementation(() => receipt),
    });
    const create = f.tx.telegramAdvertiserTask.create;
    create.mockImplementation(
      ({ data }: { data: Partial<TelegramAdvertiserTask> }) => {
        receipt = { ...initial, ...data };
        return Promise.resolve(receipt as TelegramAdvertiserTask);
      },
    );
    const input = {
      type: 'FOLLOW_UP' as const,
      assignedMemberId: 'member-a',
      title: 'Instagram follow-up',
      dueAt: '2030-02-11T12:00:00.000Z',
      metadata: { origin: 'MANUAL_INSTAGRAM' },
    };
    await f.service.create('user-a', 'client-a', input, operationId);
    await f.service.create('user-a', 'client-a', input, operationId);
    expect(create).toHaveBeenCalledTimes(1);
    expect(f.tx.telegramCrmConversation.findFirst).not.toHaveBeenCalled();
    expect(f.tx.telegramAdvertiserActivity.create).toHaveBeenCalledTimes(1);
    await expect(
      f.service.create(
        'user-a',
        'client-a',
        { ...input, dueAt: '2030-02-12T12:00:00.000Z' },
        operationId,
      ),
    ).rejects.toThrow('MANUAL_OPERATION_CONFLICT');
  });
});

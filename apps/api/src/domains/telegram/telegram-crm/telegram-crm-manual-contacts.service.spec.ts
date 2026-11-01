const firstArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];
import { ForbiddenException } from '@nestjs/common';
import { TelegramCrmManualContactsCommandService } from './telegram-crm-manual-contacts-command.service';
import { TelegramCrmManualContactsReadService } from './telegram-crm-manual-contacts-read.service';
import { TelegramCrmManualFollowUpService } from './telegram-crm-manual-follow-up.service';
const at = new Date('2030-02-10T12:00:00Z');
function fixture() {
  const row = {
    id: 'client',
    workspaceId: 'workspace',
    displayName: 'Same name',
    companyName: null,
    source: 'MANUAL_INSTAGRAM',
    ownerMemberId: 'member',
    archivedAt: null,
    manualSalesStatus: null,
    manualInstagramContactAt: at,
    manualInstagramReplyAt: null,
    nextContactAt: null,
    ownerMember: null,
    contacts: [
      {
        id: 'method',
        value: '@profile_one',
        normalizedValue: 'profile_one',
        identityState: 'ACTIVE',
        isPrimary: true,
        ownershipConfirmedAt: at,
      },
    ],
  };
  const tx = {
    telegramAdvertiserContact: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramAdvertiser: {
      create: jest.fn().mockResolvedValue({ id: 'created' }),
    },
    telegramAdvertiserActivity: { create: jest.fn() },
  };
  const prisma = {
    ...tx,
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
      Promise.resolve(fn(tx)),
    ),
    telegramAdvertiser: {
      ...tx.telegramAdvertiser,
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([row]),
    },
    telegramAdvertiserTask: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramAdvertiserActivity: {
      ...tx.telegramAdvertiserActivity,
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const crm = {
    readScope: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace', ownerMemberId: 'member' }),
    createContactContext: jest.fn().mockResolvedValue({
      workspaceId: 'workspace',
      resolvedOwnerMemberId: 'member',
    }),
    requireReadContact: jest.fn().mockResolvedValue('workspace'),
    requireEditContact: jest.fn().mockResolvedValue('workspace'),
  };
  const auth = {
    can: jest.fn().mockResolvedValue(true),
    require: jest
      .fn()
      .mockResolvedValue({ memberId: 'member', workspaceId: 'workspace' }),
  };
  const tasks = { create: jest.fn(), update: jest.fn(), complete: jest.fn() };
  return { prisma, tx, crm, auth, tasks, row };
}
describe('manual CRM clients without Telegram transport', () => {
  it('creates two same-name/different-profile canonical clients without name lookup or conversation', async () => {
    const f = fixture(),
      service = new TelegramCrmManualContactsCommandService(
        f.prisma as never,
        f.crm as never,
      );
    await service.create('user', {
      displayName: 'Same name',
      instagramValue: '@profile_one',
      ownershipConfirmed: true,
    });
    await service.create('user', {
      displayName: 'Same name',
      instagramValue: '@profile_two',
      ownershipConfirmed: true,
    });
    expect(f.tx.telegramAdvertiser.create).toHaveBeenCalledTimes(2);
    expect(firstArgument(f.tx.telegramAdvertiser.create)).toMatchObject({
      data: {
        workspaceId: 'workspace',
        ownerMemberId: 'member',
        contacts: {
          create: {
            type: 'INSTAGRAM',
            normalizedValue: 'profile_one',
            isVerified: false,
          },
        },
      },
    });
    expect(f.prisma.telegramAdvertiser.findMany).not.toHaveBeenCalled();
    expect(f.crm.createContactContext).toHaveBeenCalledWith('user', 'member');
  });
  it('rejects workspace identity collision before creating a client', async () => {
    const f = fixture();
    f.tx.telegramAdvertiserContact.findFirst.mockResolvedValue({
      id: 'another',
    });
    const service = new TelegramCrmManualContactsCommandService(
      f.prisma as never,
      f.crm as never,
    );
    await expect(
      service.create('user', {
        displayName: 'A',
        instagramValue: '@profile_one',
        ownershipConfirmed: true,
      }),
    ).rejects.toThrow('INSTAGRAM_IDENTITY_ALREADY_LINKED');
    expect(f.tx.telegramAdvertiser.create).not.toHaveBeenCalled();
  });
  it('returns scoped bounded lists/workflow without writes, AI generation, or Telegram reads', async () => {
    const f = fixture(),
      service = new TelegramCrmManualContactsReadService(
        f.prisma as never,
        f.crm as never,
        f.auth as never,
      );
    const list = await service.list('user', { limit: 10 });
    expect(list.items[0]).toMatchObject({
      methods: [
        {
          profileUrl: 'https://www.instagram.com/profile_one/',
          profileVerification: 'UNVERIFIED',
        },
      ],
      attentionStatus: 'WAITING_FOR_CLIENT',
    });
    expect(firstArgument(f.prisma.telegramAdvertiser.findMany)).toMatchObject({
      where: { workspaceId: 'workspace', ownerMemberId: 'member' },
      take: 11,
    });
    const view = await service.workflow('user', 'client');
    expect(view).toMatchObject({
      contactId: 'client',
      channel: 'INSTAGRAM',
      commercialOutreachAllowed: true,
      activities: [],
      nextFollowUp: null,
    });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.tx.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
  });
  it('does not read another owner workflow when authorization rejects', async () => {
    const f = fixture();
    f.crm.requireReadContact.mockRejectedValue(new ForbiddenException());
    const service = new TelegramCrmManualContactsReadService(
      f.prisma as never,
      f.crm as never,
      f.auth as never,
    );
    await expect(service.workflow('user', 'other-client')).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.prisma.telegramAdvertiser.findFirst).not.toHaveBeenCalled();
  });
  it('schedules through canonical follow-up commands without conversation metadata', async () => {
    const f = fixture(),
      service = new TelegramCrmManualFollowUpService(
        f.prisma as never,
        f.crm as never,
        f.auth as never,
        f.tasks as never,
      );
    await service.schedule('user', 'client', {
      operationId: '2030-02-10:6bc30dd6-05c7-4f2c-a4a8-4e9f7efde002',
      at: '2030-02-11T12:00:00Z',
    });
    expect(f.tasks.create).toHaveBeenCalledWith(
      'user',
      'client',
      expect.objectContaining({
        type: 'FOLLOW_UP',
        assignedMemberId: 'member',
        metadata: { origin: 'MANUAL_INSTAGRAM', channel: 'INSTAGRAM' },
      }),
      expect.any(String),
    );
    expect(f.crm.requireReadContact).toHaveBeenCalledWith('user', 'client');
    await expect(
      service.act('user', 'client', 'unrelated', { action: 'COMPLETE' }),
    ).rejects.toThrow('Reminder does not belong to this client');
    expect(f.tasks.complete).not.toHaveBeenCalled();
  });
  it('keeps equal manual reply/contact dates in the same Waiting filter shown by the card', async () => {
    const f = fixture();
    Object.assign(f.row, { manualInstagramReplyAt: at });
    const replyField = { name: 'manualInstagramReplyAt' };
    Object.assign(f.prisma.telegramAdvertiser, {
      fields: { manualInstagramReplyAt: replyField },
    });
    const service = new TelegramCrmManualContactsReadService(
      f.prisma as never,
      f.crm as never,
      f.auth as never,
    );
    const page = await service.list('user', { status: 'WAITING_FOR_CLIENT' });
    expect(page.items[0].attentionStatus).toBe('WAITING_FOR_CLIENT');
    expect(firstArgument(f.prisma.telegramAdvertiser.findMany)).toMatchObject({
      where: {
        AND: expect.arrayContaining([
          expect.objectContaining({
            manualInstagramContactAt: { not: null },
            OR: expect.arrayContaining([
              { manualInstagramContactAt: { gte: replyField } },
            ]) as unknown,
          }),
        ]) as unknown,
      },
    });
  });
});

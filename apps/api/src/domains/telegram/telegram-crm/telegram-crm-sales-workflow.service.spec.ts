import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  deriveCrmSalesAttention,
  type CrmManualSalesStatus,
} from '@telegram-system/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TelegramCrmSalesWorkflowService } from './telegram-crm-sales-workflow.service';
import {
  CrmSalesStatusDto,
  CrmFollowUpActionDto,
} from './telegram-crm-sales-workflow.dto';

const now = new Date('2026-10-31T10:00:00Z');
const before = new Date(now.getTime() - 1000).toISOString();
const after = new Date(now.getTime() + 1000).toISOString();
const facts = {
  state: 'ACTIVE' as const,
  manualStatus: null,
  nextContactAt: null,
  lastInboundAt: before,
  lastOutboundAt: null,
};
function setup(manualStatus: CrmManualSalesStatus | null = null, own = false) {
  const contact = {
    id: 'contact-current',
    ownerMemberId: 'member-current',
    manualSalesStatus: manualStatus,
    archivedAt: null,
    nextContactAt: null,
  };
  const row = {
    id: 'conversation-current',
    workspaceId: 'workspace-current',
    contactId: contact.id,
    state: 'ACTIVE',
    lastInboundAt: now,
    lastOutboundAt: null,
    contact,
  };
  const prisma = {
    telegramCrmConversation: { findFirst: jest.fn().mockResolvedValue(row) },
    telegramAdvertiser: {
      findFirst: jest.fn().mockResolvedValue(contact),
      update: jest
        .fn()
        .mockImplementation(
          ({
            data,
          }: {
            data: { manualSalesStatus: CrmManualSalesStatus | null };
          }) => Promise.resolve({ ...contact, ...data }),
        ),
    },
    telegramAdvertiserActivity: { create: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (run: (tx: typeof prisma) => Promise<unknown>) => run(prisma),
  );
  const authorization = {
    require: jest.fn().mockResolvedValue({
      workspaceId: row.workspaceId,
      memberId: 'member-current',
    }),
    scope: jest
      .fn()
      .mockResolvedValue(own ? { assignedMemberId: 'member-current' } : {}),
    can: jest.fn().mockResolvedValue(true),
  };
  const events = { emit: jest.fn() };
  return {
    service: new TelegramCrmSalesWorkflowService(
      prisma as never,
      authorization as never,
      events as never,
    ),
    prisma,
    authorization,
    events,
    row,
    contact,
  };
}

describe('CRM sales attention policy', () => {
  it('separates unanswered inbound from unread and returns to Needs Reply after a client answers', () => {
    expect(deriveCrmSalesAttention(facts, now.getTime())).toBe('NEEDS_REPLY');
    expect(
      deriveCrmSalesAttention(
        { ...facts, lastOutboundAt: now.toISOString() },
        now.getTime(),
      ),
    ).toBe('WAITING_FOR_CLIENT');
    expect(
      deriveCrmSalesAttention(
        { ...facts, lastOutboundAt: now.toISOString(), lastInboundAt: after },
        now.getTime(),
      ),
    ).toBe('NEEDS_REPLY');
  });
  it('uses timestamp order rather than event arrival order, including equal-second outbound acknowledgements', () => {
    expect(
      deriveCrmSalesAttention({
        ...facts,
        lastInboundAt: after,
        lastOutboundAt: before,
      }),
    ).toBe('NEEDS_REPLY');
    expect(
      deriveCrmSalesAttention({
        ...facts,
        lastInboundAt: before,
        lastOutboundAt: after,
      }),
    ).toBe('WAITING_FOR_CLIENT');
    expect(
      deriveCrmSalesAttention({
        ...facts,
        lastInboundAt: before,
        lastOutboundAt: before,
      }),
    ).toBe('WAITING_FOR_CLIENT');
  });
  it.each(['INTERESTED', 'CLOSED', 'DO_NOT_CONTACT', 'HUMAN_REVIEW'] as const)(
    'preserves explicit %s after newer incoming and due events until manually cleared',
    (manualStatus) => {
      expect(
        deriveCrmSalesAttention(
          {
            ...facts,
            manualStatus,
            lastInboundAt: after,
            nextContactAt: before,
          },
          now.getTime(),
        ),
      ).toBe(manualStatus);
    },
  );
  it.each(['ARCHIVED', 'IGNORED'] as const)(
    'never reopens %s because a message arrived',
    (state) => {
      expect(
        deriveCrmSalesAttention({ ...facts, state, lastInboundAt: after }),
      ).toBeNull();
    },
  );
  it('handles due boundaries, no messages and archived contacts without materializing status writes', () => {
    expect(
      deriveCrmSalesAttention(
        { ...facts, nextContactAt: now.toISOString() },
        now.getTime(),
      ),
    ).toBe('FOLLOW_UP_DUE');
    expect(
      deriveCrmSalesAttention(
        { ...facts, nextContactAt: after },
        now.getTime(),
      ),
    ).toBe('NEEDS_REPLY');
    expect(
      deriveCrmSalesAttention({ ...facts, lastInboundAt: null }),
    ).toBeNull();
    expect(
      deriveCrmSalesAttention({
        ...facts,
        archivedAt: before,
        manualStatus: 'INTERESTED',
      }),
    ).toBeNull();
  });
});

describe('TelegramCrmSalesWorkflowService', () => {
  it('reads one exact scoped workflow and bounds its current reminder without business writes', async () => {
    const { service, prisma } = setup(null, true);
    const result = await service.read('user-current', 'conversation-current');
    expect(result).toMatchObject({
      attentionStatus: 'NEEDS_REPLY',
      manualStatus: null,
      canEdit: true,
      commercialOutreachAllowed: true,
      nextFollowUp: null,
    });
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'conversation-current',
          workspaceId: 'workspace-current',
          contact: { ownerMemberId: 'member-current' },
        },
      }),
    );
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
    expect(prisma.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
  });
  it.each(['CLOSED', 'DO_NOT_CONTACT'] as const)(
    'blocks commercial context for %s',
    async (manual) => {
      const { service } = setup(manual);
      expect(
        await service.read('user-current', 'conversation-current'),
      ).toMatchObject({
        attentionStatus: manual,
        commercialOutreachAllowed: false,
        outreachBlockedReason: manual,
      });
    },
  );
  it('keeps archived conversation visibility distinct from its stored sales decision', async () => {
    const { service, row } = setup('INTERESTED');
    row.state = 'ARCHIVED';
    expect(await service.read('user-current', row.id)).toMatchObject({
      manualStatus: 'INTERESTED',
      attentionStatus: null,
      commercialOutreachAllowed: false,
      outreachBlockedReason: 'INACTIVE',
    });
  });
  it('writes one meaningful manual decision and event with exact workspace ownership', async () => {
    const { service, prisma, events } = setup(null, true);
    await service.setStatus('user-current', 'conversation-current', {
      manualStatus: 'DO_NOT_CONTACT',
    });
    expect(prisma.telegramAdvertiser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'contact-current',
          workspaceId: 'workspace-current',
          ownerMemberId: 'member-current',
        },
      }),
    );
    expect(prisma.telegramAdvertiser.update).toHaveBeenCalledTimes(1);
    expect(prisma.telegramAdvertiserActivity.create).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-current',
        contactId: 'contact-current',
        manualSalesStatus: 'DO_NOT_CONTACT',
      }),
    );
  });
  it('performs no update, audit or event for a repeated transition', async () => {
    const { service, prisma, events } = setup('CLOSED');
    await service.setStatus('user-current', 'conversation-current', {
      manualStatus: 'CLOSED',
    });
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
    expect(prisma.telegramAdvertiserActivity.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('clears the manual decision explicitly without changing operational state', async () => {
    const { service, prisma } = setup('CLOSED');
    await service.setStatus('user-current', 'conversation-current', {
      manualStatus: null,
    });
    expect(prisma.telegramAdvertiser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { manualSalesStatus: null } }),
    );
    expect(prisma.telegramCrmConversation.findFirst).toHaveBeenCalled();
  });
  it('rejects missing/foreign records without writes or events', async () => {
    const { service, prisma, events } = setup();
    prisma.telegramCrmConversation.findFirst.mockResolvedValue(null);
    await expect(
      service.read('user-current', 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.setStatus('user-current', 'foreign', { manualStatus: 'CLOSED' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('requires a linked contact and editing permission', async () => {
    const { service, prisma, authorization } = setup();
    prisma.telegramCrmConversation.findFirst.mockResolvedValue({
      contactId: null,
    });
    await expect(
      service.setStatus('user-current', 'unlinked', { manualStatus: 'CLOSED' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    authorization.scope.mockRejectedValue(new ForbiddenException());
    await expect(
      service.setStatus('user-current', 'hidden', { manualStatus: 'CLOSED' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.telegramAdvertiser.update).not.toHaveBeenCalled();
  });
  it('does not publish a decision whose transaction failed', async () => {
    const { service, prisma, events } = setup();
    prisma.telegramAdvertiserActivity.create.mockRejectedValue(
      new Error('transaction failed'),
    );
    await expect(
      service.setStatus('user-current', 'conversation-current', {
        manualStatus: 'CLOSED',
      }),
    ).rejects.toThrow('transaction failed');
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('workflow DTO', () => {
  it.each([{ manualStatus: null }, { manualStatus: 'INTERESTED' }])(
    'accepts explicit manual decision/reset %j',
    async (input) => {
      expect(
        await validate(plainToInstance(CrmSalesStatusDto, input)),
      ).toHaveLength(0);
    },
  );
  it.each([{}, { manualStatus: 'NEEDS_REPLY' }, { manualStatus: 'ACTIVE' }])(
    'rejects inferred/operational or missing decision %j',
    async (input) => {
      expect(
        await validate(plainToInstance(CrmSalesStatusDto, input)),
      ).not.toHaveLength(0);
    },
  );
  it('rejects an unknown follow-up action', async () => {
    expect(
      await validate(plainToInstance(CrmFollowUpActionDto, { action: 'SEND' })),
    ).not.toHaveLength(0);
  });
});

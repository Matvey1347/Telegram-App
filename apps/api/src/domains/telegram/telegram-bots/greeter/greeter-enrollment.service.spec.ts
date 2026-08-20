import { GreeterAutomationEnvironment, Prisma } from '@prisma/client';
import { GreeterEnrollmentService } from './greeter-enrollment.service';

describe('GreeterEnrollmentService', () => {
  function setup() {
    const sequence = {
      id: 'sequence-1',
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      currentPublishedVersionId: 'version-1',
      channelId: null,
      trigger: 'AFTER_CAPTCHA_SUCCESS' as const,
    };
    const enrollment = {
      id: 'enrollment-1',
      enrolledAt: new Date('2026-08-09T10:00:00.000Z'),
    };
    const execution = { id: 'execution-1', status: 'PENDING' };
    const prisma = {
      greeterJoinRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ channelId: 'channel-1' }),
      },
      greeterSequence: { findMany: jest.fn(), findFirst: jest.fn() },
      greeterSequenceVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'version-1' }),
      },
      telegramBotUser: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      greeterChannel: {
        findFirst: jest.fn().mockResolvedValue({ id: 'greeter-channel-1' }),
      },
      greeterSequenceEnrollment: {
        create: jest.fn().mockResolvedValue(enrollment),
        findUnique: jest.fn().mockResolvedValue(enrollment),
      },
      greeterSequenceStep: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'step-1', delaySeconds: 60 }]),
      },
      greeterSequenceStepExecution: {
        upsert: jest.fn().mockResolvedValue(execution),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          ...execution,
          dueAt: new Date('2026-08-09T10:01:00.000Z'),
          step: { messageText: 'Hello {{channel.title}}', buttons: [] },
          enrollment: {
            workspaceId: 'workspace-1',
            botIntegrationId: 'bot-1',
            telegramBotUserId: 'user-1',
            telegramUser: {
              telegramChatId: '123',
              telegramUserId: '123',
              firstName: 'Alex',
              lastName: null,
              username: null,
            },
            acquiredChannel: {
              id: 'channel-1',
              title: 'Exact',
              username: null,
            },
          },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const delivery = {
      enqueueSendMessage: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
    };
    const service = new GreeterEnrollmentService(
      prisma as never,
      delivery as never,
    );
    return { service, prisma, delivery, sequence, enrollment, execution };
  }

  it('enrolls once per logical sequence and exact acquisition channel', async () => {
    const { service, prisma, delivery, sequence } = setup();
    await service.enrollVersion({
      sequence,
      versionId: 'version-1',
      telegramBotUserId: 'user-1',
      acquiredChannelId: 'channel-1',
      acquisitionJoinRequestId: 'join-1',
      environment: GreeterAutomationEnvironment.PRODUCTION,
    });

    expect(prisma.greeterSequenceEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sequenceId: 'sequence-1',
          sequenceVersionId: 'version-1',
          logicalScopeKey: 'CHANNEL:channel-1',
          runKey: 'PRODUCTION',
        }),
      }),
    );
    expect(delivery.enqueueSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello Exact' }),
    );
  });

  it('persists a bounded retry when delivery queueing fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T10:00:00.000Z'));
    try {
      const { service, prisma, delivery } = setup();
      delivery.enqueueSendMessage.mockRejectedValueOnce(
        new Error('queue unavailable'),
      );

      await expect(service.queueExecution('execution-1')).rejects.toThrow(
        'queue unavailable',
      );

      expect(
        prisma.greeterSequenceStepExecution.updateMany,
      ).toHaveBeenCalledWith({
        where: { id: 'execution-1', status: 'PENDING' },
        data: {
          dueAt: new Date('2026-08-09T10:05:00.000Z'),
          lastError: 'queue unavailable',
        },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not repair a pending future execution before it is due', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T10:00:00.000Z'));
    try {
      const { service, prisma, delivery } = setup();

      await expect(service.repairPendingExecutions()).resolves.toEqual({
        processed: 0,
        queued: 0,
        failed: 0,
      });

      expect(prisma.greeterSequenceStepExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            dueAt: { lte: new Date('2026-08-09T10:00:00.000Z') },
          },
        }),
      );
      expect(delivery.enqueueSendMessage).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('prefers enabled channel sequences and falls back to global', async () => {
    const { service, prisma, sequence } = setup();
    prisma.greeterSequence.findMany.mockResolvedValue([
      { ...sequence, id: 'global', channelId: null },
      { ...sequence, id: 'scoped', channelId: 'channel-1' },
    ]);
    const enroll = jest.spyOn(service, 'enrollVersion').mockResolvedValue({
      id: 'enrollment-1',
    } as never);

    await service.enrollForTrigger({
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'user-1',
      trigger: 'AFTER_CAPTCHA_SUCCESS',
      channelId: 'channel-1',
      joinRequestId: 'join-1',
    });

    expect(enroll).toHaveBeenCalledTimes(1);
    expect(enroll).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: expect.objectContaining({ id: 'scoped' }),
      }),
    );
  });

  it('backfills AFTER_START from started users without inventing a channel', async () => {
    const { service, prisma, sequence } = setup();
    const startSequence = { ...sequence, trigger: 'AFTER_START' as const };
    prisma.telegramBotUser.findMany.mockResolvedValue([{ id: 'started-user' }]);
    const enroll = jest.spyOn(service, 'enrollVersion').mockResolvedValue({
      id: 'enrollment-1',
    } as never);

    await service.enrollExistingAcquisitions(startSequence, 'version-1');

    expect(prisma.greeterJoinRequest.findMany).not.toHaveBeenCalled();
    expect(enroll).toHaveBeenCalledWith(
      expect.objectContaining({
        telegramBotUserId: 'started-user',
        acquiredChannelId: null,
        acquisitionJoinRequestId: undefined,
      }),
    );
  });

  it('isolates one acquisition failure while publishing existing users', async () => {
    const { service, prisma, sequence } = setup();
    prisma.greeterJoinRequest.findMany.mockResolvedValue([
      { id: 'join-1', telegramBotUserId: 'user-1', channelId: 'channel-1' },
      { id: 'join-2', telegramBotUserId: 'user-2', channelId: 'channel-2' },
    ]);
    jest
      .spyOn(service, 'enrollVersion')
      .mockRejectedValueOnce(new Error('token=secret failed'))
      .mockResolvedValueOnce({ id: 'enrollment-2' } as never);

    const result = await service.enrollExistingAcquisitions(
      sequence,
      'version-1',
    );

    expect(result).toMatchObject({ total: 2, enrolled: 1, failed: 1 });
    expect(result.failures[0]?.reason).not.toContain('secret');
  });

  it('does not regress a terminal execution back to queued', async () => {
    const { service, prisma, delivery } = setup();
    prisma.greeterSequenceStepExecution.findUnique.mockResolvedValue({
      id: 'execution-1',
      status: 'SENT',
    });

    await service.queueExecution('execution-1');

    expect(delivery.enqueueSendMessage).not.toHaveBeenCalled();
    expect(
      prisma.greeterSequenceStepExecution.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('does not enqueue version 2 when the logical production enrollment exists', async () => {
    const { service, prisma, delivery, sequence, enrollment } = setup();
    prisma.greeterSequenceEnrollment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate logical enrollment', {
        code: 'P2002',
        clientVersion: '7.8.0',
      }),
    );
    prisma.greeterSequenceEnrollment.findUnique.mockResolvedValue(enrollment);

    await service.enrollVersion({
      sequence,
      versionId: 'version-2',
      telegramBotUserId: 'user-1',
      acquiredChannelId: 'channel-1',
      environment: GreeterAutomationEnvironment.PRODUCTION,
    });

    expect(prisma.greeterSequenceStep.findMany).not.toHaveBeenCalled();
    expect(delivery.enqueueSendMessage).not.toHaveBeenCalled();
  });

  it('requires exact approved join context for CAPTCHA-success enrollment', async () => {
    const { service } = setup();
    await expect(
      service.enrollForTrigger({
        workspaceId: 'workspace-1',
        botIntegrationId: 'bot-1',
        telegramBotUserId: 'user-1',
        trigger: 'AFTER_CAPTCHA_SUCCESS',
        channelId: 'channel-1',
      }),
    ).rejects.toThrow('Approved join request context is required');
  });
});

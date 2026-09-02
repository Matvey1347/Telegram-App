import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  GreeterAutomationEnvironment,
  GreeterSequenceVersionStatus,
  Prisma,
} from '@prisma/client';
import { sanitizeOperationalError } from '../../../../common/security/operational-error';
import { PrismaService } from '../../../../prisma/prisma.service';
import { telegramMarkupToHtml } from '../../../../telegram/shared/telegram-markup';
import type { GreeterButtonRows } from './greeter-automation.service';
import { renderGreeterTemplate } from './greeter-template.renderer';
import { TelegramBotDeliveryService } from '../core/telegram-bot-delivery.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../../common/scheduled-task-wake-notifier';
import {
  GREETER_AUTOMATION_RETRY_MS,
  greeterAutomationDueWhere,
} from '../../../operations/scheduled-tasks/due-work-predicates';

export type RuntimeEnrollmentInput = {
  workspaceId: string;
  botIntegrationId: string;
  telegramBotUserId: string;
  trigger: 'AFTER_START' | 'AFTER_CAPTCHA_SUCCESS';
  environment?: GreeterAutomationEnvironment;
  channelId?: string | null;
  joinRequestId?: string;
  runKey?: string;
};

export type SequenceShape = {
  id: string;
  workspaceId: string;
  botIntegrationId: string;
  currentPublishedVersionId: string | null;
  channelId: string | null;
  trigger: 'AFTER_START' | 'AFTER_CAPTCHA_SUCCESS';
};

type EnrollmentRow = Prisma.GreeterSequenceEnrollmentGetPayload<object>;

export class GreeterEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: TelegramBotDeliveryService,
  ) {}

  async enrollExistingAcquisitions(sequence: SequenceShape, versionId: string) {
    const acquisitions =
      sequence.trigger === 'AFTER_START'
        ? await this.startedUsersForBackfill(sequence)
        : await this.captchaAcquisitionsForBackfill(sequence);
    let enrolled = 0;
    const failures: Array<{ acquisitionId: string; reason: string }> = [];
    for (const acquisition of acquisitions) {
      try {
        await this.enrollVersion({
          sequence,
          versionId,
          telegramBotUserId: acquisition.telegramBotUserId,
          acquiredChannelId: acquisition.channelId,
          acquisitionJoinRequestId: acquisition.joinRequestId,
          environment: GreeterAutomationEnvironment.PRODUCTION,
          runKey: 'PRODUCTION',
        });
        enrolled += 1;
      } catch (error) {
        failures.push({
          acquisitionId:
            acquisition.joinRequestId ?? acquisition.telegramBotUserId,
          reason: sanitizeOperationalError(error, 'Enrollment failed'),
        });
      }
    }
    return {
      total: acquisitions.length,
      enrolled,
      failed: failures.length,
      failures,
    };
  }

  async enrollForTrigger(
    input: RuntimeEnrollmentInput,
    resolveTestVersion?: (sequenceId: string) => Promise<{ id: string }>,
  ) {
    if (input.trigger === 'AFTER_CAPTCHA_SUCCESS' && !input.joinRequestId) {
      throw new BadRequestException(
        'Approved join request context is required',
      );
    }
    const candidates = await this.prisma.greeterSequence.findMany({
      where: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        trigger: input.trigger,
        enabled: true,
        OR: input.channelId
          ? [{ channelId: input.channelId }, { channelId: null }]
          : [{ channelId: null }],
      },
    });
    const scoped = input.channelId
      ? candidates.filter((sequence) => sequence.channelId === input.channelId)
      : [];
    const sequences = scoped.length
      ? scoped
      : candidates.filter((sequence) => sequence.channelId == null);
    const environment =
      input.environment ?? GreeterAutomationEnvironment.PRODUCTION;
    const acquisition = {
      channelId: input.channelId ?? null,
      joinRequestId: input.joinRequestId,
    };
    const results: unknown[] = [];
    for (const sequence of sequences) {
      const versionId =
        environment === GreeterAutomationEnvironment.TEST
          ? (await resolveTestVersion?.(sequence.id))?.id
          : sequence.currentPublishedVersionId;
      if (!versionId) continue;
      results.push(
        await this.enrollVersion({
          sequence,
          versionId,
          telegramBotUserId: input.telegramBotUserId,
          acquiredChannelId: acquisition.channelId,
          acquisitionJoinRequestId: acquisition.joinRequestId,
          environment,
          runKey:
            input.runKey ??
            (environment === GreeterAutomationEnvironment.PRODUCTION
              ? 'PRODUCTION'
              : undefined),
        }),
      );
    }
    return results;
  }

  async enrollLegacy(input: {
    workspaceId: string;
    botIntegrationId: string;
    sequenceId: string;
    versionId?: string;
    telegramBotUserId: string;
    environment: GreeterAutomationEnvironment;
    acquiredChannelId?: string | null;
    acquisitionJoinRequestId?: string;
    testRunKey?: string;
    runKey?: string;
  }) {
    const sequence = await this.prisma.greeterSequence.findFirst({
      where: {
        id: input.sequenceId,
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
      },
    });
    if (!sequence) throw new NotFoundException('Sequence not found');
    const channelId = input.acquiredChannelId ?? null;
    const versionId = input.versionId ?? sequence.currentPublishedVersionId;
    if (!versionId)
      throw new BadRequestException('Published version is required');
    return this.enrollVersion({
      sequence,
      versionId,
      telegramBotUserId: input.telegramBotUserId,
      acquiredChannelId: channelId,
      acquisitionJoinRequestId: input.acquisitionJoinRequestId,
      environment: input.environment,
      runKey: input.runKey ?? input.testRunKey,
    });
  }

  async enrollVersion(input: {
    sequence: SequenceShape;
    versionId: string;
    telegramBotUserId: string;
    acquiredChannelId: string | null;
    acquisitionJoinRequestId?: string;
    environment: GreeterAutomationEnvironment;
    runKey?: string;
  }): Promise<EnrollmentRow> {
    if (
      input.environment === GreeterAutomationEnvironment.TEST &&
      !input.runKey
    )
      throw new BadRequestException('TEST enrollment run key is required');
    if (
      input.sequence.channelId &&
      input.sequence.channelId !== input.acquiredChannelId
    )
      throw new BadRequestException('Sequence channel context does not match');
    await Promise.all([
      this.requireBotUser(input.sequence, input.telegramBotUserId),
      input.acquiredChannelId
        ? this.requireChannel(input.sequence, input.acquiredChannelId)
        : Promise.resolve(),
      this.requireVersion(
        input.sequence.id,
        input.versionId,
        input.environment,
      ),
      input.acquisitionJoinRequestId
        ? this.requireAcquisition(input)
        : Promise.resolve(),
    ]);
    const data = enrollmentData(input);
    const identity = {
      sequenceId: input.sequence.id,
      telegramBotUserId: input.telegramBotUserId,
      environment: input.environment,
      logicalScopeKey: data.logicalScopeKey,
      runKey: data.runKey,
    };
    let enrollment: EnrollmentRow;
    try {
      enrollment = await this.prisma.greeterSequenceEnrollment.create({
        data,
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const existing = await this.prisma.greeterSequenceEnrollment.findUnique({
        where: {
          sequenceId_telegramBotUserId_environment_logicalScopeKey_runKey:
            identity,
        },
      });
      if (!existing) throw error;
      return existing;
    }
    const steps = await this.prisma.greeterSequenceStep.findMany({
      where: { versionId: input.versionId, enabled: true },
      orderBy: { position: 'asc' },
    });
    let offset = 0;
    for (const step of steps) {
      offset += step.delaySeconds;
      const execution = await this.prisma.greeterSequenceStepExecution.upsert({
        where: {
          enrollmentId_stepId: {
            enrollmentId: enrollment.id,
            stepId: step.id,
          },
        },
        update: {},
        create: {
          enrollmentId: enrollment.id,
          stepId: step.id,
          dueAt: new Date(enrollment.enrolledAt.getTime() + offset * 1000),
        },
      });
      await this.queueExecution(execution.id);
    }
    notifyScheduledTaskDueWorkChanged('greeter.automations.repair');
    return enrollment;
  }

  async queueExecution(executionId: string) {
    const execution = await this.prisma.greeterSequenceStepExecution.findUnique(
      {
        where: { id: executionId },
        include: {
          step: true,
          enrollment: {
            include: { telegramUser: true, acquiredChannel: true },
          },
        },
      },
    );
    if (!execution || execution.status !== 'PENDING') return execution;
    const text = telegramMarkupToHtml(
      renderGreeterTemplate(execution.step.messageText, {
        channel: execution.enrollment.acquiredChannel ?? {
          title: '',
          username: null,
        },
        user: execution.enrollment.telegramUser,
      }),
    );
    if (!execution.enrollment.telegramUser.telegramChatId) {
      return this.prisma.greeterSequenceStepExecution.updateMany({
        where: { id: execution.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          lastError: 'Telegram user has no reachable private chat',
        },
      });
    }
    let delivery: Awaited<
      ReturnType<TelegramBotDeliveryService['enqueueSendMessage']>
    >;
    try {
      delivery = await this.delivery.enqueueSendMessage({
        workspaceId: execution.enrollment.workspaceId,
        botIntegrationId: execution.enrollment.botIntegrationId,
        telegramBotUserId: execution.enrollment.telegramBotUserId,
        chatId: execution.enrollment.telegramUser.telegramChatId,
        text,
        parseMode: 'HTML',
        inlineButtons: (execution.step.buttons ??
          undefined) as GreeterButtonRows,
        scheduledAt: execution.dueAt,
        idempotencyKey: `greeter-step:${execution.id}`,
      });
    } catch (error) {
      await this.prisma.greeterSequenceStepExecution.updateMany({
        where: { id: execution.id, status: 'PENDING' },
        data: {
          dueAt: new Date(
            Math.max(
              execution.dueAt.getTime(),
              Date.now() + GREETER_AUTOMATION_RETRY_MS,
            ),
          ),
          lastError: sanitizeOperationalError(error, 'Queueing failed'),
        },
      });
      notifyScheduledTaskDueWorkChanged('greeter.automations.repair');
      throw error;
    }
    return this.prisma.greeterSequenceStepExecution.updateMany({
      where: { id: execution.id, status: 'PENDING' },
      data: { status: 'QUEUED', deliveryId: delivery.id, lastError: null },
    });
  }

  async repairPendingExecutions(limit = 100) {
    const rows = await this.prisma.greeterSequenceStepExecution.findMany({
      where: greeterAutomationDueWhere(new Date()),
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
    let queued = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.queueExecution(row.id);
        queued += 1;
      } catch {
        failed += 1;
      }
    }
    return { processed: rows.length, queued, failed };
  }

  private async requireVersion(
    sequenceId: string,
    versionId: string,
    environment: GreeterAutomationEnvironment,
  ) {
    const status =
      environment === GreeterAutomationEnvironment.TEST
        ? GreeterSequenceVersionStatus.DRAFT
        : GreeterSequenceVersionStatus.PUBLISHED;
    const version = await this.prisma.greeterSequenceVersion.findFirst({
      where: { id: versionId, sequenceId, status },
    });
    if (!version) throw new NotFoundException('Sequence version not found');
  }

  private async requireBotUser(sequence: SequenceShape, userId: string) {
    const user = await this.prisma.telegramBotUser.findFirst({
      where: {
        id: userId,
        workspaceId: sequence.workspaceId,
        botIntegrationId: sequence.botIntegrationId,
        blockedAt: null,
      },
    });
    if (!user) throw new NotFoundException('Eligible bot user not found');
  }

  private async requireChannel(sequence: SequenceShape, channelId: string) {
    const channel = await this.prisma.greeterChannel.findFirst({
      where: {
        workspaceId: sequence.workspaceId,
        botIntegrationId: sequence.botIntegrationId,
        channelId,
        enabled: true,
      },
    });
    if (!channel)
      throw new NotFoundException('Eligible Greeter channel not found');
  }

  private async requireAcquisition(input: {
    sequence: SequenceShape;
    telegramBotUserId: string;
    acquiredChannelId: string | null;
    acquisitionJoinRequestId?: string;
    environment: GreeterAutomationEnvironment;
  }) {
    if (!input.acquiredChannelId)
      throw new BadRequestException('Acquisition channel is required');
    const acquisition = await this.prisma.greeterJoinRequest.findFirst({
      where: {
        id: input.acquisitionJoinRequestId,
        workspaceId: input.sequence.workspaceId,
        botIntegrationId: input.sequence.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        channelId: input.acquiredChannelId,
        environment: input.environment,
        OR: [{ status: 'APPROVED' }, { captchaPassedAt: { not: null } }],
      },
    });
    if (!acquisition)
      throw new NotFoundException('Approved acquisition not found');
  }

  private async startedUsersForBackfill(sequence: SequenceShape) {
    const users = await this.prisma.telegramBotUser.findMany({
      where: {
        workspaceId: sequence.workspaceId,
        botIntegrationId: sequence.botIntegrationId,
        startedAt: { not: null },
        blockedAt: null,
        telegramChatId: { not: null },
        ...(sequence.channelId
          ? {
              greeterJoinRequests: {
                some: {
                  channelId: sequence.channelId,
                  environment: GreeterAutomationEnvironment.PRODUCTION,
                },
              },
            }
          : {}),
      },
      orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    return users.map((user) => ({
      telegramBotUserId: user.id,
      channelId: sequence.channelId,
      joinRequestId: undefined,
    }));
  }

  private async captchaAcquisitionsForBackfill(sequence: SequenceShape) {
    const rows = await this.prisma.greeterJoinRequest.findMany({
      where: {
        workspaceId: sequence.workspaceId,
        botIntegrationId: sequence.botIntegrationId,
        environment: GreeterAutomationEnvironment.PRODUCTION,
        ...(sequence.channelId ? { channelId: sequence.channelId } : {}),
        OR: [{ status: 'APPROVED' }, { captchaPassedAt: { not: null } }],
        telegramUser: { blockedAt: null, telegramChatId: { not: null } },
      },
      distinct: ['telegramBotUserId', 'channelId'],
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, telegramBotUserId: true, channelId: true },
    });
    return rows.map((row) => ({
      telegramBotUserId: row.telegramBotUserId,
      channelId: row.channelId,
      joinRequestId: row.id,
    }));
  }
}

function enrollmentData(input: {
  sequence: SequenceShape;
  versionId: string;
  telegramBotUserId: string;
  acquiredChannelId: string | null;
  acquisitionJoinRequestId?: string;
  environment: GreeterAutomationEnvironment;
  runKey?: string;
}) {
  const logicalScopeKey = input.acquiredChannelId
    ? `CHANNEL:${input.acquiredChannelId}`
    : 'GLOBAL';
  return {
    workspaceId: input.sequence.workspaceId,
    botIntegrationId: input.sequence.botIntegrationId,
    sequenceId: input.sequence.id,
    sequenceVersionId: input.versionId,
    telegramBotUserId: input.telegramBotUserId,
    acquiredChannelId: input.acquiredChannelId,
    acquisitionJoinRequestId: input.acquisitionJoinRequestId,
    environment: input.environment,
    logicalScopeKey,
    runKey:
      input.runKey ??
      (input.environment === GreeterAutomationEnvironment.PRODUCTION
        ? 'PRODUCTION'
        : 'TEST'),
  };
}

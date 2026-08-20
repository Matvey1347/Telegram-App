import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GreeterAutomationEnvironment } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GreeterEnrollmentService } from './greeter-enrollment.service';
import { GreeterSequenceAdminService } from './greeter-sequence-admin.service';
import {
  mapGreeterTestSession,
  mapGreeterTester,
} from './greeter-sequence-support';

export class GreeterAutomationTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: GreeterSequenceAdminService,
    private readonly enrollments: GreeterEnrollmentService,
  ) {}

  async lookupTesters(userId: string, botId: string, search = '') {
    const bot = await this.sequences.requireBot(userId, botId);
    const users = await this.prisma.telegramBotUser.findMany({
      where: {
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        blockedAt: null,
        telegramChatId: { not: null },
        OR: [
          { startedAt: { not: null } },
          {
            greeterJoinRequests: {
              some: {
                botIntegrationId: bot.id,
                OR: [
                  { captchaPassedAt: { not: null } },
                  { status: 'APPROVED' },
                ],
              },
            },
          },
        ],
        ...(search.trim()
          ? {
              AND: [
                {
                  OR: [
                    {
                      username: {
                        contains: search.trim(),
                        mode: 'insensitive',
                      },
                    },
                    {
                      firstName: {
                        contains: search.trim(),
                        mode: 'insensitive',
                      },
                    },
                    {
                      lastName: {
                        contains: search.trim(),
                        mode: 'insensitive',
                      },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: { lastInteractionAt: 'desc' },
      take: 25,
    });
    return users.map(mapGreeterTester);
  }

  async selectTester(
    userId: string,
    botId: string,
    sequenceId: string,
    input: { telegramBotUserId: string; channelId: string; enabled?: boolean },
  ) {
    const sequence = await this.sequences.require(userId, botId, sequenceId);
    await Promise.all([
      this.requireBotUser(sequence, input.telegramBotUserId),
      this.requireChannel(sequence, input.channelId),
    ]);
    await this.cancelRuns(sequence.botIntegrationId);
    const now = new Date();
    const session = await this.prisma.greeterTestSession.upsert({
      where: { botIntegrationId: sequence.botIntegrationId },
      create: {
        workspaceId: sequence.workspaceId,
        botIntegrationId: sequence.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        channelId: input.channelId,
        enabled: input.enabled ?? true,
        enabledAt: input.enabled === false ? null : now,
        disabledAt: input.enabled === false ? now : null,
      },
      update: {
        telegramBotUserId: input.telegramBotUserId,
        channelId: input.channelId,
        enabled: input.enabled ?? true,
        generation: { increment: 1 },
        startedAt: null,
        lastInteractionAt: null,
        enabledAt: input.enabled === false ? null : now,
        disabledAt: input.enabled === false ? now : null,
      },
      include: { telegramUser: true, channel: true },
    });
    return mapGreeterTestSession(session);
  }

  async disableTester(userId: string, botId: string, sequenceId: string) {
    const sequence = await this.sequences.require(userId, botId, sequenceId);
    await this.cancelRuns(sequence.botIntegrationId);
    const session = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: sequence.botIntegrationId },
      include: { telegramUser: true, channel: true },
    });
    if (!session) return null;
    const updated = await this.prisma.greeterTestSession.update({
      where: { id: session.id },
      data: { enabled: false, disabledAt: new Date() },
      include: { telegramUser: true, channel: true },
    });
    return mapGreeterTestSession(updated);
  }

  async run(userId: string, botId: string, sequenceId: string) {
    const sequence = await this.sequences.require(userId, botId, sequenceId);
    const session = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: sequence.botIntegrationId },
    });
    if (!session?.enabled || !session.telegramBotUserId || !session.channelId) {
      throw new BadRequestException(
        'Select and enable a tester and channel first',
      );
    }
    await this.cancelRuns(sequence.botIntegrationId);
    const updated = await this.prisma.greeterTestSession.update({
      where: { id: session.id },
      data: { generation: { increment: 1 } },
    });
    const version = await this.sequences.snapshotPreview(sequenceId);
    return this.enrollments.enrollVersion({
      sequence,
      versionId: version.id,
      telegramBotUserId: session.telegramBotUserId,
      acquiredChannelId: session.channelId,
      environment: GreeterAutomationEnvironment.TEST,
      runKey: `TEST:${session.id}:${updated.generation}`,
    });
  }

  async reset(userId: string, botId: string, sequenceId: string) {
    const sequence = await this.sequences.require(userId, botId, sequenceId);
    await this.cancelRuns(sequence.botIntegrationId);
    const current = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: sequence.botIntegrationId },
    });
    if (!current) return null;
    const session = await this.prisma.greeterTestSession.update({
      where: { id: current.id },
      data: {
        generation: { increment: 1 },
        startedAt: null,
        lastInteractionAt: null,
      },
      include: { telegramUser: true, channel: true },
    });
    return mapGreeterTestSession(session);
  }

  private async cancelRuns(botIntegrationId: string) {
    const enrollments = await this.prisma.greeterSequenceEnrollment.findMany({
      where: {
        botIntegrationId,
        environment: GreeterAutomationEnvironment.TEST,
        cancelledAt: null,
      },
      include: { executions: { include: { delivery: true } } },
    });
    for (const enrollment of enrollments) {
      const cancellable = enrollment.executions.filter(
        (item) =>
          !item.delivery ||
          ['PENDING', 'RETRY', 'PROCESSING'].includes(item.delivery.status),
      );
      const deliveryIds = cancellable.flatMap((item) =>
        item.deliveryId ? [item.deliveryId] : [],
      );
      await this.prisma.$transaction([
        this.prisma.telegramBotDelivery.updateMany({
          where: {
            id: { in: deliveryIds },
            status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
          },
          data: { status: 'CANCELLED', lockedAt: null, lockedUntil: null },
        }),
        this.prisma.greeterSequenceStepExecution.updateMany({
          where: { id: { in: cancellable.map((item) => item.id) } },
          data: { status: 'CANCELLED', completedAt: new Date() },
        }),
        this.prisma.greeterSequenceEnrollment.update({
          where: { id: enrollment.id },
          data: { cancelledAt: new Date() },
        }),
      ]);
    }
  }

  private async requireBotUser(
    sequence: { workspaceId: string; botIntegrationId: string },
    userId: string,
  ) {
    const user = await this.prisma.telegramBotUser.findFirst({
      where: {
        id: userId,
        workspaceId: sequence.workspaceId,
        botIntegrationId: sequence.botIntegrationId,
        blockedAt: null,
        telegramChatId: { not: null },
        OR: [
          { startedAt: { not: null } },
          {
            greeterJoinRequests: {
              some: {
                botIntegrationId: sequence.botIntegrationId,
                OR: [
                  { captchaPassedAt: { not: null } },
                  { status: 'APPROVED' },
                ],
              },
            },
          },
        ],
      },
    });
    if (!user)
      throw new NotFoundException(
        'User not found. Ask this user to start/interact with the bot first.',
      );
  }

  private async requireChannel(
    sequence: { workspaceId: string; botIntegrationId: string },
    channelId: string,
  ) {
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
}

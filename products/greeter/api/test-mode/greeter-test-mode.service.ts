import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GreeterAutomationEnvironment, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { GreeterAdminService } from './greeter-admin.service';

@Injectable()
export class GreeterTestModeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: GreeterAdminService,
  ) {}

  async get(userId: string, botId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const session = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: bot.id },
      include: { telegramUser: true, channel: true },
    });
    return this.view(session);
  }

  async resolve(userId: string, botId: string, rawUsername: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const username = this.normalizeUsername(rawUsername);
    const user = await this.prisma.telegramBotUser.findFirst({
      where: {
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        username: { equals: username, mode: 'insensitive' },
        blockedAt: null,
        telegramChatId: { not: null },
      },
      orderBy: { lastInteractionAt: 'desc' },
    });
    if (!user) {
      throw new NotFoundException(
        'User not found. Ask this user to open and start this bot first.',
      );
    }
    return this.tester(user);
  }

  async enable(
    userId: string,
    botId: string,
    input: { telegramBotUserId: string; channelId?: string },
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    const [tester, channel] = await Promise.all([
      this.prisma.telegramBotUser.findFirst({
        where: {
          id: input.telegramBotUserId,
          workspaceId: bot.workspaceId,
          botIntegrationId: bot.id,
          blockedAt: null,
          telegramChatId: { not: null },
        },
      }),
      input.channelId
        ? this.prisma.greeterChannel.findFirst({
            where: {
              workspaceId: bot.workspaceId,
              botIntegrationId: bot.id,
              channelId: input.channelId,
              enabled: true,
            },
            select: { channelId: true },
          })
        : null,
    ]);
    if (!tester) {
      throw new NotFoundException(
        'Test user not found for this bot. Ask the user to start it first.',
      );
    }
    if (input.channelId && !channel) {
      throw new NotFoundException('Eligible Greeter channel not found');
    }
    const now = new Date();
    const existing = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: bot.id },
    });
    if (!existing) {
      await this.prisma.greeterTestSession.create({
        data: {
          workspaceId: bot.workspaceId,
          botIntegrationId: bot.id,
          telegramBotUserId: tester.id,
          channelId: channel?.channelId ?? null,
          enabled: true,
          enabledAt: now,
        },
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await this.cancelTestWork(tx, existing);
        await tx.greeterJoinRequest.deleteMany({
          where: {
            testSessionId: existing.id,
            environment: GreeterAutomationEnvironment.TEST,
          },
        });
        if (existing.telegramBotUserId) {
          await tx.greeterUserEnvironmentState.deleteMany({
            where: {
              workspaceId: bot.workspaceId,
              botIntegrationId: bot.id,
              telegramBotUserId: existing.telegramBotUserId,
              environment: GreeterAutomationEnvironment.TEST,
            },
          });
        }
        await tx.greeterTestSession.update({
          where: { id: existing.id },
          data: {
            telegramBotUserId: tester.id,
            channelId: channel?.channelId ?? null,
            enabled: true,
            generation: { increment: 1 },
            startedAt: null,
            lastInteractionAt: null,
            enabledAt: now,
            disabledAt: null,
          },
        });
      });
    }
    return this.get(userId, botId);
  }

  async reset(userId: string, botId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const session = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: bot.id },
    });
    if (!session?.telegramBotUserId) {
      throw new BadRequestException('Enable a test user first');
    }
    const telegramBotUserId = session.telegramBotUserId;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.greeterTestSession.updateMany({
        where: {
          id: session.id,
          generation: session.generation,
          telegramBotUserId,
        },
        data: {
          generation: { increment: 1 },
          startedAt: null,
          lastInteractionAt: null,
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('Test state changed; reload and retry');
      await this.cancelTestWork(tx, session);
      await tx.greeterJoinRequest.deleteMany({
        where: {
          testSessionId: session.id,
          environment: GreeterAutomationEnvironment.TEST,
        },
      });
      await tx.greeterUserEnvironmentState.deleteMany({
        where: {
          workspaceId: bot.workspaceId,
          botIntegrationId: bot.id,
          telegramBotUserId,
          environment: GreeterAutomationEnvironment.TEST,
        },
      });
    });
    return this.get(userId, botId);
  }

  async disable(userId: string, botId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const session = await this.prisma.greeterTestSession.findUnique({
      where: { botIntegrationId: bot.id },
    });
    if (!session) return this.view(null);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.cancelTestWork(tx, session);
      await tx.greeterTestSession.update({
        where: { id: session.id },
        data: { enabled: false, disabledAt: now },
      });
    });
    return this.get(userId, botId);
  }

  activeSession(botIntegrationId: string, telegramUserId: string) {
    return this.prisma.greeterTestSession.findFirst({
      where: {
        botIntegrationId,
        enabled: true,
        telegramUser: { telegramUserId, botIntegrationId },
      },
      include: { telegramUser: true, channel: true },
    });
  }

  async touch(input: {
    workspaceId: string;
    botIntegrationId: string;
    telegramBotUserId: string;
    generation: number;
    started?: boolean;
    at?: Date;
  }) {
    const at = input.at ?? new Date();
    const identity = {
      botIntegrationId_telegramBotUserId_environment_generation: {
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        environment: GreeterAutomationEnvironment.TEST,
        generation: input.generation,
      },
    };
    const existing = await this.prisma.greeterUserEnvironmentState.findUnique({
      where: identity,
    });
    const state = await this.prisma.greeterUserEnvironmentState.upsert({
      where: identity,
      create: {
        workspaceId: input.workspaceId,
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        environment: GreeterAutomationEnvironment.TEST,
        generation: input.generation,
        startedAt: input.started ? at : null,
        lastInteractionAt: at,
      },
      update: {
        lastInteractionAt: at,
        ...(input.started && !existing?.startedAt ? { startedAt: at } : {}),
      },
    });
    await this.prisma.greeterTestSession.updateMany({
      where: {
        botIntegrationId: input.botIntegrationId,
        telegramBotUserId: input.telegramBotUserId,
        generation: input.generation,
        enabled: true,
      },
      data: {
        lastInteractionAt: at,
        ...(input.started ? { startedAt: state.startedAt ?? at } : {}),
      },
    });
    return {
      state,
      firstStart: Boolean(input.started && !existing?.startedAt),
    };
  }

  claimStart(input: {
    workspaceId: string;
    botIntegrationId: string;
    telegramBotUserId: string;
    generation: number;
    at?: Date;
  }) {
    return this.touch({ ...input, started: true });
  }

  private async cancelTestWork(
    tx: Prisma.TransactionClient,
    session: {
      id: string;
      botIntegrationId: string;
      telegramBotUserId: string | null;
    },
  ) {
    if (!session.telegramBotUserId) return;
    await tx.telegramBotDelivery.updateMany({
      where: {
        botIntegrationId: session.botIntegrationId,
        status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
        OR: [
          {
            greeterStepExecution: {
              enrollment: {
                telegramBotUserId: session.telegramBotUserId,
                environment: GreeterAutomationEnvironment.TEST,
              },
            },
          },
          {
            greeterCaptchaJoinRequest: { testSessionId: session.id },
          },
          {
            greeterOutcomeJoinRequest: { testSessionId: session.id },
          },
        ],
      },
      data: {
        status: 'CANCELLED',
        lockedAt: null,
        lockedUntil: null,
      },
    });
    await tx.greeterSequenceStepExecution.updateMany({
      where: {
        enrollment: {
          botIntegrationId: session.botIntegrationId,
          telegramBotUserId: session.telegramBotUserId,
          environment: GreeterAutomationEnvironment.TEST,
          cancelledAt: null,
        },
        status: { in: ['PENDING', 'QUEUED'] },
      },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    await tx.greeterSequenceEnrollment.updateMany({
      where: {
        botIntegrationId: session.botIntegrationId,
        telegramBotUserId: session.telegramBotUserId,
        environment: GreeterAutomationEnvironment.TEST,
        cancelledAt: null,
      },
      data: { cancelledAt: new Date() },
    });
  }

  private normalizeUsername(value: string) {
    const username = value.trim().replace(/^@+/, '');
    if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      throw new BadRequestException('Enter a valid Telegram @username');
    }
    return username;
  }

  private tester(user: {
    id: string;
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  }) {
    return {
      id: user.id,
      telegramUserId: user.telegramUserId,
      username: user.username,
      displayName:
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.username ||
        user.telegramUserId,
    };
  }

  private view(
    session: {
      id: string;
      enabled: boolean;
      generation: number;
      startedAt: Date | null;
      lastInteractionAt: Date | null;
      enabledAt: Date | null;
      disabledAt: Date | null;
      telegramUser?: Parameters<GreeterTestModeService['tester']>[0] | null;
      channel?: { id: string; title: string; username: string | null } | null;
    } | null,
  ) {
    return {
      enabled: Boolean(session?.enabled),
      generation: session?.generation ?? 0,
      startedAt: session?.startedAt?.toISOString() ?? null,
      lastInteractionAt: session?.lastInteractionAt?.toISOString() ?? null,
      enabledAt: session?.enabledAt?.toISOString() ?? null,
      disabledAt: session?.disabledAt?.toISOString() ?? null,
      tester: session?.telegramUser ? this.tester(session.telegramUser) : null,
      channel: session?.channel
        ? {
            id: session.channel.id,
            title: session.channel.title,
            username: session.channel.username,
          }
        : null,
    };
  }
}

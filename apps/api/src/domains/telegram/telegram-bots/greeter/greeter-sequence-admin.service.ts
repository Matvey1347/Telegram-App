import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  GreeterSequenceTrigger,
  GreeterSequenceVersionStatus,
  Prisma,
} from '@prisma/client';
import type {
  GreeterSequenceStepInput,
  GreeterTemplateContextInput,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { GreeterButtonRows } from './greeter-automation.service';
import { GreeterAdminService } from './greeter-admin.service';
import { renderGreeterTemplate } from './greeter-template.renderer';
import {
  mapGreeterStep,
  mapGreeterTestSession,
  validateGreeterButtons,
  validateGreeterSteps,
} from './greeter-sequence-support';

export class GreeterSequenceAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: GreeterAdminService,
  ) {}

  requireBot(userId: string, botId: string) {
    return this.admin.requireBot(userId, botId);
  }

  async list(userId: string, botId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const rows = await this.prisma.greeterSequence.findMany({
      where: { workspaceId: bot.workspaceId, botIntegrationId: bot.id },
      include: {
        channel: { select: { id: true, title: true, username: true } },
        _count: { select: { draftSteps: true } },
        versions: {
          where: { status: GreeterSequenceVersionStatus.PUBLISHED },
          orderBy: { version: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.summary(row));
  }

  async create(
    userId: string,
    botId: string,
    input: {
      name: string;
      trigger: 'AFTER_START' | 'AFTER_CAPTCHA_SUCCESS';
      channelId?: string | null;
    },
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Sequence name is required');
    if (input.channelId) await this.requireChannel(bot, input.channelId);
    return this.prisma.greeterSequence.create({
      data: {
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
        name,
        trigger: input.trigger,
        channelId: input.channelId ?? null,
      },
    });
  }

  async update(
    userId: string,
    botId: string,
    sequenceId: string,
    input: {
      name?: string;
      trigger?: 'AFTER_START' | 'AFTER_CAPTCHA_SUCCESS';
      enabled?: boolean;
      channelId?: string | null;
    },
  ) {
    const sequence = await this.require(userId, botId, sequenceId);
    const name = input.name?.trim();
    if (input.name !== undefined && !name)
      throw new BadRequestException('Sequence name is required');
    if (input.channelId) await this.requireChannel(sequence, input.channelId);
    return this.prisma.greeterSequence.update({
      where: { id: sequence.id },
      data: {
        ...input,
        ...(name ? { name } : {}),
        ...(input.channelId !== undefined
          ? { channelId: input.channelId }
          : {}),
      },
    });
  }

  async detail(userId: string, botId: string, sequenceId: string) {
    const sequence = await this.require(userId, botId, sequenceId);
    const [row, testSession] = await Promise.all([
      this.prisma.greeterSequence.findUniqueOrThrow({
        where: { id: sequence.id },
        include: {
          channel: { select: { id: true, title: true, username: true } },
          draftSteps: { orderBy: { position: 'asc' } },
          versions: {
            where: { status: GreeterSequenceVersionStatus.PUBLISHED },
            include: { _count: { select: { steps: true } } },
            orderBy: { version: 'desc' },
          },
        },
      }),
      this.prisma.greeterTestSession.findUnique({
        where: { botIntegrationId: sequence.botIntegrationId },
        include: { telegramUser: true, channel: true },
      }),
    ]);
    return {
      ...this.summary({
        ...row,
        _count: { draftSteps: row.draftSteps.length },
      }),
      draftSteps: row.draftSteps.map(mapGreeterStep),
      versions: row.versions.map((version) => ({
        id: version.id,
        version: version.version,
        publishedAt: version.createdAt.toISOString(),
        stepCount: version._count.steps,
      })),
      testSession: testSession ? mapGreeterTestSession(testSession) : null,
    };
  }

  async replaceDraftSteps(
    userId: string,
    botId: string,
    sequenceId: string,
    steps: GreeterSequenceStepInput[],
    expectedRevision?: number,
  ) {
    const sequence = await this.require(userId, botId, sequenceId);
    validateGreeterSteps(steps);
    if (
      expectedRevision !== undefined &&
      sequence.draftRevision !== expectedRevision
    )
      throw new ConflictException(
        'Sequence draft changed; reload and try again',
      );
    await this.prisma.$transaction(async (tx) => {
      const fenced = await tx.greeterSequence.updateMany({
        where: {
          id: sequence.id,
          ...(expectedRevision !== undefined
            ? { draftRevision: expectedRevision }
            : {}),
        },
        data: { draftRevision: { increment: 1 } },
      });
      if (fenced.count !== 1)
        throw new ConflictException('Sequence draft changed');
      await tx.greeterSequenceStep.deleteMany({ where: { sequenceId } });
      await tx.greeterSequenceStep.createMany({
        data: [...steps]
          .sort((a, b) => a.position - b.position)
          .map((step) => ({
            sequenceId,
            position: step.position,
            delaySeconds: step.delaySeconds,
            messageText: step.messageText.trim(),
            buttons: step.buttons,
            enabled: step.enabled,
          })),
      });
    });
    return this.detail(userId, botId, sequenceId);
  }

  async publish(
    userId: string,
    botId: string,
    sequenceId: string,
    expectedRevision: number,
  ) {
    const sequence = await this.require(userId, botId, sequenceId);
    const version = await this.snapshot(
      sequence.id,
      GreeterSequenceVersionStatus.PUBLISHED,
      expectedRevision,
      true,
    );
    return {
      sequence,
      version,
      view: await this.versionView(sequence.id, version.id, true),
    };
  }

  async versionDetail(
    userId: string,
    botId: string,
    sequenceId: string,
    versionId: string,
  ) {
    const sequence = await this.require(userId, botId, sequenceId);
    return this.versionView(sequence.id, versionId, true);
  }

  async preview(
    userId: string,
    botId: string,
    input: GreeterTemplateContextInput & {
      messageText: string;
      buttons?: GreeterButtonRows;
    },
  ) {
    const bot = await this.admin.requireBot(userId, botId);
    GreeterSequenceAdminService.validateButtons(input.buttons);
    const [channel, user] = await Promise.all([
      input.channelId
        ? this.prisma.telegramChannel.findFirst({
            where: { id: input.channelId, workspaceId: bot.workspaceId },
          })
        : null,
      input.telegramBotUserId
        ? this.prisma.telegramBotUser.findFirst({
            where: {
              id: input.telegramBotUserId,
              workspaceId: bot.workspaceId,
              botIntegrationId: bot.id,
            },
          })
        : null,
    ]);
    const context = {
      channel: {
        title: channel?.title ?? input.sample?.channelTitle ?? 'Sample channel',
        username: channel?.username ?? input.sample?.channelUsername ?? null,
      },
      user: {
        firstName: user?.firstName ?? input.sample?.firstName ?? 'Alex',
        lastName: user?.lastName ?? null,
        username: user?.username ?? input.sample?.username ?? null,
      },
    };
    return {
      renderedText: renderGreeterTemplate(input.messageText, context),
      buttons: input.buttons ?? [],
      variables: {},
    };
  }

  async require(userId: string, botId: string, sequenceId: string) {
    const bot = await this.admin.requireBot(userId, botId);
    const sequence = await this.prisma.greeterSequence.findFirst({
      where: {
        id: sequenceId,
        workspaceId: bot.workspaceId,
        botIntegrationId: bot.id,
      },
    });
    if (!sequence) throw new NotFoundException('Sequence not found');
    return sequence;
  }

  async snapshotPreview(sequenceId: string) {
    return this.snapshot(
      sequenceId,
      GreeterSequenceVersionStatus.DRAFT,
      undefined,
      false,
    );
  }

  private async snapshot(
    sequenceId: string,
    status: GreeterSequenceVersionStatus,
    expectedRevision: number | undefined,
    makeCurrent: boolean,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const sequence = await tx.greeterSequence.findUnique({
          where: { id: sequenceId },
          include: {
            draftSteps: { orderBy: { position: 'asc' } },
            versions: {
              where: { status },
              orderBy: {
                version:
                  status === GreeterSequenceVersionStatus.DRAFT
                    ? 'asc'
                    : 'desc',
              },
              take: 1,
            },
          },
        });
        if (!sequence) throw new NotFoundException('Sequence not found');
        if (
          expectedRevision !== undefined &&
          sequence.draftRevision !== expectedRevision
        )
          throw new ConflictException(
            'Sequence draft changed; reload and try again',
          );
        if (!sequence.draftSteps.length)
          throw new BadRequestException('Add at least one draft step first');
        const existing = await tx.greeterSequenceVersion.findFirst({
          where: {
            sequenceId,
            status,
            sourceDraftRevision: sequence.draftRevision,
          },
        });
        if (existing) {
          if (
            makeCurrent &&
            sequence.currentPublishedVersionId !== existing.id
          ) {
            await tx.greeterSequence.updateMany({
              where: {
                id: sequenceId,
                ...(expectedRevision !== undefined
                  ? { draftRevision: expectedRevision }
                  : {}),
              },
              data: { currentPublishedVersionId: existing.id },
            });
          }
          return existing;
        }
        const version = await tx.greeterSequenceVersion.create({
          data: {
            sequenceId,
            version:
              status === GreeterSequenceVersionStatus.DRAFT
                ? (sequence.versions[0]?.version ?? 0) - 1
                : (sequence.versions[0]?.version ?? 0) + 1,
            status,
            sourceDraftRevision: sequence.draftRevision,
          },
        });
        await tx.greeterSequenceStep.createMany({
          data: sequence.draftSteps.map((step) => ({
            versionId: version.id,
            position: step.position,
            delaySeconds: step.delaySeconds,
            messageText: step.messageText,
            buttons: step.buttons ?? undefined,
            enabled: step.enabled,
          })),
        });
        if (makeCurrent) {
          const fenced = await tx.greeterSequence.updateMany({
            where: {
              id: sequenceId,
              ...(expectedRevision !== undefined
                ? { draftRevision: expectedRevision }
                : {}),
            },
            data: { currentPublishedVersionId: version.id },
          });
          if (fenced.count !== 1)
            throw new ConflictException('Sequence draft changed');
        }
        return version;
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const sequence = await this.prisma.greeterSequence.findUnique({
        where: { id: sequenceId },
        select: { draftRevision: true },
      });
      const existing = sequence
        ? await this.prisma.greeterSequenceVersion.findFirst({
            where: {
              sequenceId,
              status,
              sourceDraftRevision: sequence.draftRevision,
            },
          })
        : null;
      if (!existing) throw error;
      return existing;
    }
  }

  private async versionView(
    sequenceId: string,
    versionId: string,
    publishedOnly: boolean,
  ) {
    const version = await this.prisma.greeterSequenceVersion.findFirst({
      where: {
        id: versionId,
        sequenceId,
        ...(publishedOnly
          ? { status: GreeterSequenceVersionStatus.PUBLISHED }
          : {}),
      },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!version) throw new NotFoundException('Sequence version not found');
    return {
      id: version.id,
      sequenceId,
      version: version.version,
      publishedAt: version.createdAt.toISOString(),
      steps: version.steps.map(mapGreeterStep),
    };
  }

  private summary(row: {
    id: string;
    name: string;
    trigger: GreeterSequenceTrigger;
    enabled: boolean;
    draftRevision: number;
    currentPublishedVersionId: string | null;
    updatedAt: Date;
    channel: { id: string; title: string; username: string | null } | null;
    versions: Array<{ id: string; version: number; createdAt: Date }>;
    _count: { draftSteps: number };
  }) {
    const current = row.versions.find(
      (item) => item.id === row.currentPublishedVersionId,
    );
    return {
      id: row.id,
      name: row.name,
      trigger: row.trigger,
      scope: {
        type: row.channel ? ('CHANNEL' as const) : ('GLOBAL' as const),
        channel: row.channel,
      },
      enabled: row.enabled,
      draftRevision: row.draftRevision,
      draftStepCount: row._count.draftSteps,
      currentVersion: current
        ? {
            id: current.id,
            version: current.version,
            publishedAt: current.createdAt.toISOString(),
          }
        : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async requireChannel(
    scope: { workspaceId: string; botIntegrationId?: string; id?: string },
    channelId: string,
  ) {
    const botIntegrationId = scope.botIntegrationId ?? scope.id;
    if (!botIntegrationId)
      throw new NotFoundException('Greeter bot context is unavailable');
    const channel = await this.prisma.greeterChannel.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        botIntegrationId,
        channelId,
        enabled: true,
      },
      select: { id: true },
    });
    if (!channel)
      throw new NotFoundException('Eligible Greeter channel not found');
  }

  static validateButtons(buttons?: GreeterButtonRows) {
    validateGreeterButtons(buttons);
  }
}

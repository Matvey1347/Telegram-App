import { ConflictException, NotFoundException } from '@nestjs/common';
import { GreeterConfig, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const snapshotFields = [
  'captchaEnabled',
  'captchaType',
  'captchaMessage',
  'confirmButtonText',
  'choicePrompt',
  'timeoutMinutes',
  'successMessage',
  'failureMessage',
  'failureBehavior',
] as const;

function snapshotData(row: Record<string, unknown>) {
  return Object.fromEntries(snapshotFields.map((key) => [key, row[key]]));
}

/** Focused persistence helper; the public configuration service owns auth/read models. */
export class GreeterConfigVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureConfig(workspaceId: string, botIntegrationId: string) {
    let config = await this.prisma.greeterConfig.upsert({
      where: { botIntegrationId },
      create: { workspaceId, botIntegrationId },
      update: {},
    });
    if (!config.currentPublishedVersionId) {
      try {
        await this.snapshot(config, false);
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
      }
      config = await this.prisma.greeterConfig.findUniqueOrThrow({
        where: { id: config.id },
      });
    }
    return config;
  }

  async publish(config: GreeterConfig) {
    try {
      await this.snapshot(config, true);
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const current = await this.prisma.greeterConfig.findUnique({
        where: { id: config.id },
      });
      if (current?.publishedRevision !== config.draftRevision) throw error;
    }
  }

  private async snapshot(
    config: GreeterConfig,
    requireExpectedRevision: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.greeterConfig.findUnique({
        where: { id: config.id },
        include: { channels: true },
      });
      if (!current) throw new NotFoundException('Greeter config not found');
      if (
        requireExpectedRevision &&
        current.draftRevision !== config.draftRevision
      ) {
        throw new ConflictException('Greeter configuration changed; reload');
      }
      if (current.publishedRevision === current.draftRevision) return current;
      const version = await tx.greeterConfigVersion.create({
        data: {
          workspaceId: current.workspaceId,
          botIntegrationId: current.botIntegrationId,
          configId: current.id,
          revision: current.draftRevision,
          ...snapshotData(current),
        } as Prisma.GreeterConfigVersionUncheckedCreateInput,
      });
      if (current.channels.length) {
        await tx.greeterChannelConfigVersion.createMany({
          data: current.channels.map((channel) => ({
            workspaceId: channel.workspaceId,
            botIntegrationId: channel.botIntegrationId,
            configVersionId: version.id,
            greeterChannelId: channel.id,
            enabled: channel.enabled,
            useGlobalConfig: channel.useGlobalConfig,
            ...snapshotData(channel),
          })),
        });
      }
      const published = await tx.greeterConfig.updateMany({
        where: {
          id: current.id,
          draftRevision: current.draftRevision,
          ...(requireExpectedRevision
            ? { publishedRevision: current.publishedRevision }
            : { currentPublishedVersionId: null }),
        },
        data: {
          currentPublishedVersionId: version.id,
          publishedRevision: current.draftRevision,
        },
      });
      if (published.count !== 1)
        throw new ConflictException('Greeter configuration changed; reload');
      return version;
    });
  }
}

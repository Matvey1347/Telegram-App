import type { TelegramAiPostingEditorialAssignment } from './telegram-ai-posting-editorial-selection';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import type { PrismaService } from '../../../prisma/prisma.service';
import { decodeAiPostingRunPublications } from './telegram-ai-posting-run-data';
import { AI_POSTING_BACKGROUND_RUN_FILTER, AI_POSTING_BACKGROUND_STALE_RUN_MS, TelegramAiPostingRunStopped } from './telegram-ai-posting-progress';
import {
  writeTelegramAiPostingTestRun,
  type TestPublication,
} from './telegram-ai-posting-test-run.store';
import {
  telegramAiPostingRunCosts,
  type TelegramAiPostingRunOperation,
} from './telegram-ai-posting-generation-outcome';

export async function readTelegramAiPostingGenerationSettings(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
) {
  const [channel, settings] = await Promise.all([
    prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        language: true,
        photoUrl: true,
        title: true,
        username: true,
        description: true,
        inviteLink: true,
        defaultInviteLink: { select: { url: true, isRevoked: true } },
        publicInviteLink: { select: { url: true, isRevoked: true } },
        presentationIcon: true,
      },
    }),
    prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: {
        configuration: true,
        configurationVersion: true,
        aiDailyBudget: true,
        aiMonthlyBudget: true,
      },
    }),
  ]);
  if (!settings) throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
  return { channel, settings };
}

export async function createTelegramAiPostingGenerationRun(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  count: number,
  settingsVersion: number,
  hybrid: boolean,
  background = false,
) {
  const create = async (client: Prisma.TransactionClient) => {
    const scope = { workspaceId, telegramChannelId: channelId };
    if (background) {
      const pendingScope = { ...scope, ...AI_POSTING_BACKGROUND_RUN_FILTER, status: 'RUNNING' };
      const staleSince = new Date(Date.now() - AI_POSTING_BACKGROUND_STALE_RUN_MS);
      await client.telegramAiPostingTestRun.updateMany({
        where: { ...pendingScope, updatedAt: { lt: staleSince } },
        data: { status: 'INTERRUPTED', version: { increment: 1 } },
      });
      const active = await client.telegramAiPostingTestRun.findFirst({
        where: pendingScope,
        select: { id: true, version: true },
      });
      if (active) return { ...active, editorialOffset: 0, existing: true };
    }
    const { _sum } = await client.telegramAiPostingTestRun.aggregate({
      where: scope,
      _sum: { requestedCount: true },
    });
    const run = await client.telegramAiPostingTestRun.create({
      data: {
        ...scope,
        requestedCount: count,
        settingsVersion,
        status: 'RUNNING',
        publications: background ? { items: [], background: true } : [],
        failures: [],
        operations: [],
        feedback: [],
      },
      select: { id: true, version: true },
    });
    return { ...run, editorialOffset: _sum.requestedCount ?? 0, existing: false };
  };
  if (!hybrid && !background) return create(prisma);
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionLock(
      tx,
      `ai-posting-hybrid:${workspaceId}:${channelId}`,
    );
    return create(tx);
  });
}

export type TelegramAiPostingRetrySlot = {
  id: string;
  version: number;
  requestedCount: number;
  publications: Prisma.JsonValue;
  failures: Prisma.JsonValue[];
  operations: TelegramAiPostingRunOperation[];
  failureIndex: number;
  publicationIndex: number;
  imageMode?: 'found' | 'ai';
  editorialAssignment?: TelegramAiPostingEditorialAssignment;
  legacyVote?: boolean;
};

export async function assertTelegramAiPostingRunActive(prisma: PrismaService, workspaceId: string, id: string) {
  const active = await prisma.telegramAiPostingTestRun.findFirst({
    where: { id, workspaceId, status: 'RUNNING' }, select: { id: true },
  });
  if (!active) throw new TelegramAiPostingRunStopped();
}

export async function claimTelegramAiPostingRetrySlot(
  prisma: PrismaService,
  workspaceId: string,
  channelId: string,
  slot: TelegramAiPostingRetrySlot,
) {
  const claimed = await prisma.telegramAiPostingTestRun.updateMany({
    where: {
      id: slot.id,
      workspaceId,
      telegramChannelId: channelId,
      version: slot.version,
      status: { in: ['PARTIAL', 'FAILED'] },
    },
    data: { status: 'RUNNING', version: { increment: 1 } },
  });
  if (!claimed.count)
    throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
  return { id: slot.id, version: slot.version + 1 };
}

export async function settleTelegramAiPostingRetrySlot(
  prisma: PrismaService,
  workspaceId: string,
  slot: TelegramAiPostingRetrySlot,
  publication: TestPublication | undefined,
  attemptOperations: TelegramAiPostingRunOperation[],
  failures: unknown[],
) {
  const decoded = decodeAiPostingRunPublications(slot.publications);
  const publications = decoded.publications as TestPublication[];
  if (publication) {
    const previousAttempts = slot.operations.filter(
      (operation) => operation.publicationIndex === slot.publicationIndex,
    );
    const planning = slot.operations.filter(
      (operation) => operation.stage === 'planning',
    );
    const costs = telegramAiPostingRunCosts([
      ...planning,
      ...previousAttempts,
      ...attemptOperations,
    ]);
    publications.push({
      ...publication,
      operations: [...planning, ...previousAttempts, ...attemptOperations],
      costs: {
        planning:
          costs.planning
            ?.div(slot.requestedCount)
            .toDecimalPlaces(12)
            .toString() ?? null,
        text: costs.text?.toString() ?? null,
        image: publication.imageCostUnknown
          ? null
          : (costs.image?.toString() ?? null),
        review: costs.review?.toString() ?? null,
      },
    });
  }
  const remainingFailures: unknown[] = [...slot.failures];
  remainingFailures.splice(slot.failureIndex, 1, ...failures);
  const status = publications.length
    ? remainingFailures.length
      ? 'PARTIAL'
      : 'COMPLETED'
    : 'FAILED';
  await writeTelegramAiPostingTestRun(
    prisma,
    slot.id,
    workspaceId,
    slot.version + 1,
    publications,
    [...slot.operations, ...attemptOperations],
    status,
    decoded.sourceDiagnostics,
    remainingFailures,
  );
  return { failures: remainingFailures, retryFailures: failures };
}

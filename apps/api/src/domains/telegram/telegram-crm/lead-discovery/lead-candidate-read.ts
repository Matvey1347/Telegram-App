import { leadReferenceUnavailable } from './lead-source-reference';
import { NotFoundException } from '@nestjs/common';
import type { Prisma, TelegramLeadCandidate } from '@prisma/client';
import type {
  LeadCandidateListFilter,
  LeadCandidateView,
} from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { TelegramLeadReadService } from './lead-read.service';
import { leadCandidateSummary } from './lead-candidate-presentation';
import { decodeLeadCursor, leadCursor, leadLimit } from './lead-normalization';
const sourceIds = (row: TelegramLeadCandidate): string[] =>
  Array.isArray(row.sourceIds)
    ? row.sourceIds
        .filter((value): value is string => typeof value === 'string')
        .slice(0, 1000)
    : [];
async function sourceSummaries(
  prisma: PrismaService,
  workspaceId: string,
  rows: TelegramLeadCandidate[],
): Promise<Array<{ id: string; title: string; url: string | null; username: string | null }>> {
  const ids = [...new Set(rows.flatMap((row) => sourceIds(row)))].slice(
    0,
    1000,
  );
  return ids.length
    ? prisma.telegramLeadSource
        .findMany({
          where: { workspaceId, id: { in: ids } },
          select: {
            id: true,
            title: true,
            url: true,
            username: true,
            monitoringState: true,
            lastErrorCode: true,
          },
          take: 1000,
        })
        .then((rows) =>
          rows.map((row) => ({
            ...row,
            url: leadReferenceUnavailable(row) ? null : row.url,
          })),
        )
    : [];
}
export async function loadLeadCandidate(
  prisma: PrismaService,
  workspaceId: string,
  id: string,
  observations: TelegramLeadReadService['observations'],
): Promise<LeadCandidateView> {
  const row = await prisma.telegramLeadCandidate.findFirst({
    where: { id, workspaceId },
    include: {
      observations: {
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
        take: 6,
        include: {
          source: {
            select: {
              id: true,
              title: true,
              url: true,
              monitoringState: true,
              lastErrorCode: true,
              bindingRevision: true,
            },
          },
        },
      },
    },
  });
  if (!row) throw new NotFoundException('LEAD_CANDIDATE_NOT_FOUND');
  const [materials, sources, aliases] = await Promise.all([
    observations(row.observations.slice(0, 5)),
    sourceSummaries(prisma, workspaceId, [row]),
    prisma.telegramLeadCandidate.findMany({
      where: { workspaceId, mergedIntoId: id },
      select: { id: true, title: true },
      orderBy: { id: 'asc' },
      take: 10,
    }),
  ]);
  return {
    ...leadCandidateSummary(row, sources),
    observations: materials,
    hasMoreObservations: row.observations.length > 5,
    aliases: aliases.map((alias) => ({ ...alias, reason: 'HUMAN_MERGE' })),
  };
}
export async function loadLeadCandidatePage(
  prisma: PrismaService,
  workspaceId: string,
  filter: LeadCandidateListFilter,
) {
  const limit = leadLimit(filter.limit),
    cursor = decodeLeadCursor(filter.cursor);
  const where: Prisma.TelegramLeadCandidateWhereInput = {
    workspaceId,
    ...(cursor ? { id: { lt: cursor } } : {}),
    ...(filter.search
      ? {
          title: { contains: filter.search.slice(0, 100), mode: 'insensitive' },
        }
      : {}),
    ...(filter.reviewStatus ? { reviewStatus: filter.reviewStatus } : {}),
    ...(filter.riskStatus ? { riskStatus: filter.riskStatus } : {}),
    ...(filter.sourceId
      ? {
          OR: [
            { sourceIds: { array_contains: [filter.sourceId] } },
            {
              observations: {
                some: { workspaceId, sourceId: filter.sourceId },
              },
            },
          ],
        }
      : {}),
  };
  const rows = await prisma.telegramLeadCandidate.findMany({
      where,
      include: { _count: { select: { observations: true } } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    }),
    page = rows.slice(0, limit),
    sources = await sourceSummaries(prisma, workspaceId, page);
  return {
    items: page.map((row) =>
      leadCandidateSummary(
        row,
        sources
          .filter((source) => sourceIds(row).includes(source.id))
          .slice(0, 6),
      ),
    ),
    hasMore: rows.length > limit,
    nextCursor: rows.length > limit ? leadCursor(page.at(-1)!.id) : null,
  };
}
export async function loadLeadCandidateSummaries(
  prisma: PrismaService,
  workspaceId: string,
  ids: string[],
) {
  const rows = await prisma.telegramLeadCandidate.findMany({
      where: { workspaceId, id: { in: ids } },
      include: { _count: { select: { observations: true } } },
      orderBy: { id: 'asc' },
      take: 20,
    }),
    sources = await sourceSummaries(prisma, workspaceId, rows);
  return rows.map((row) =>
    leadCandidateSummary(
      row,
      sources
        .filter((source) => sourceIds(row).includes(source.id))
        .slice(0, 6),
    ),
  );
}

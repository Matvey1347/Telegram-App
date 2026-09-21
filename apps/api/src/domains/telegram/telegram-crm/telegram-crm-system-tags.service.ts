import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { CrmTagSummary } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;

export const CRM_WORKFLOW_TAGS = [
  {
    systemKey: 'WORKFLOW:FOLDER',
    name: '📁 Folder',
    color: '#f59e0b',
    position: 10,
  },
  {
    systemKey: 'WORKFLOW:MUTUAL_PROMOTION',
    name: '🤝 VP',
    color: '#a78bfa',
    position: 20,
  },
  {
    systemKey: 'WORKFLOW:INBOUND_AD_OFFER',
    name: '📁🤝 Folder VP',
    color: '#34d399',
    position: 30,
  },
] as const;

export const CRM_WORKFLOW_TAG_SYSTEM_KEYS = CRM_WORKFLOW_TAGS.map(
  (tag) => tag.systemKey,
);

export const crmTagSelect = {
  id: true,
  name: true,
  color: true,
  systemKey: true,
} satisfies Prisma.TelegramAdvertiserTagSelect;

export type CrmTagRow = Prisma.TelegramAdvertiserTagGetPayload<{
  select: typeof crmTagSelect;
}>;

export function mapCrmTag(tag: CrmTagRow): CrmTagSummary {
  return {
    ...tag,
    isSystem: Boolean(tag.systemKey),
    assignmentMode:
      tag.systemKey?.startsWith('NETWORK:') ||
      tag.systemKey?.startsWith('CHANNEL:')
        ? 'AUTOMATIC'
        : 'MANUAL',
  };
}

@Injectable()
export class TelegramCrmSystemTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureWorkflowTags(workspaceId: string, db: DbClient = this.prisma) {
    const keys = CRM_WORKFLOW_TAGS.map((tag) => tag.systemKey);
    const existing = await db.telegramAdvertiserTag.findMany({
      where: { workspaceId, systemKey: { in: keys } },
      select: { systemKey: true },
    });
    const existingKeys = new Set(existing.map((tag) => tag.systemKey));
    const missing = CRM_WORKFLOW_TAGS.filter(
      (tag) => !existingKeys.has(tag.systemKey),
    );
    if (missing.length) {
      await db.telegramAdvertiserTag.createMany({
        data: missing.map((tag) => ({ workspaceId, ...tag })),
        skipDuplicates: true,
      });
    }
  }

  async syncPurchasedTags(
    workspaceId: string,
    advertiserId: string,
    db: DbClient = this.prisma,
  ) {
    return syncPurchasedCrmTags(db, workspaceId, advertiserId);
  }
}

export async function syncPurchasedCrmTags(
  db: DbClient,
  workspaceId: string,
  advertiserId: string,
) {
  const placements = await db.telegramAdSalePlacement.findMany({
    where: {
      workspaceId,
      status: {
        notIn: [
          TelegramAdPlacementStatus.CANCELLED,
          TelegramAdPlacementStatus.MISSED,
        ],
      },
      sale: {
        advertiserId,
        status: {
          in: [
            TelegramAdSaleStatus.RESERVED,
            TelegramAdSaleStatus.CONFIRMED,
            TelegramAdSaleStatus.IN_PROGRESS,
            TelegramAdSaleStatus.COMPLETED,
          ],
        },
      },
    },
    select: {
      telegramChannel: {
        select: {
          id: true,
          title: true,
          networkMembers: {
            select: { network: { select: { id: true, name: true } } },
          },
        },
      },
      network: { select: { id: true, name: true } },
    },
  });

  const definitions = new Map<
    string,
    { name: string; color: string; position: number }
  >();
  for (const placement of placements) {
    const channel = placement.telegramChannel;
    definitions.set(`CHANNEL:${channel.id}`, {
      name: `Channel · ${channel.title}`,
      color: '#38bdf8',
      position: 200,
    });
    const networks = placement.network
      ? [placement.network]
      : channel.networkMembers.map((member) => member.network);
    for (const network of networks) {
      definitions.set(`NETWORK:${network.id}`, {
        name: `Network · ${network.name}`,
        color: '#60a5fa',
        position: 100,
      });
    }
  }
  const systemKeys = [...definitions.keys()];
  if (systemKeys.length) {
    const existing = await db.telegramAdvertiserTag.findMany({
      where: { workspaceId, systemKey: { in: systemKeys } },
      select: { systemKey: true },
    });
    const existingKeys = new Set(existing.map((tag) => tag.systemKey));
    const missing = systemKeys.filter((key) => !existingKeys.has(key));
    if (missing.length) {
      await db.telegramAdvertiserTag.createMany({
        data: missing.map((systemKey) => ({
          workspaceId,
          systemKey,
          ...definitions.get(systemKey)!,
        })),
        skipDuplicates: true,
      });
    }
  }

  const [tags, automaticAssignments] = await Promise.all([
    db.telegramAdvertiserTag.findMany({
      where: { workspaceId, systemKey: { in: systemKeys } },
      select: { id: true, systemKey: true },
    }),
    db.telegramAdvertiserTagAssignment.findMany({
      where: {
        workspaceId,
        advertiserId,
        tag: {
          OR: [
            { systemKey: { startsWith: 'NETWORK:' } },
            { systemKey: { startsWith: 'CHANNEL:' } },
          ],
        },
      },
      select: { tagId: true, tag: { select: { systemKey: true } } },
    }),
  ]);
  const desiredKeys = new Set(systemKeys);
  const staleTagIds = automaticAssignments
    .filter(
      (assignment) =>
        !assignment.tag.systemKey || !desiredKeys.has(assignment.tag.systemKey),
    )
    .map((assignment) => assignment.tagId);
  if (staleTagIds.length) {
    await db.telegramAdvertiserTagAssignment.deleteMany({
      where: { workspaceId, advertiserId, tagId: { in: staleTagIds } },
    });
  }
  const assignedTagIds = new Set(
    automaticAssignments.map((assignment) => assignment.tagId),
  );
  const missingAssignments = tags.filter((tag) => !assignedTagIds.has(tag.id));
  if (!missingAssignments.length) return;
  await db.telegramAdvertiserTagAssignment.createMany({
    data: missingAssignments.map((tag) => ({
      workspaceId,
      advertiserId,
      tagId: tag.id,
    })),
    skipDuplicates: true,
  });
}

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramAdPlacementStatus,
  TelegramAdSaleStatus,
} from '@prisma/client';
import type { CrmTagSummary } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoDialogFolder,
} from '../../../telegram/shared/telegram-crm-mtproto.types';

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

export const TELEGRAM_FOLDER_TAG_PREFIX = 'TELEGRAM_FOLDER:';

export const CRM_VISIBLE_TAG_WHERE = {
  OR: [
    { systemKey: null },
    { systemKey: { in: CRM_WORKFLOW_TAG_SYSTEM_KEYS } },
    { systemKey: { startsWith: TELEGRAM_FOLDER_TAG_PREFIX } },
  ],
} satisfies Prisma.TelegramAdvertiserTagWhereInput;

const telegramFolderColors: Record<number, string> = {
  0: '#ef4444',
  1: '#f97316',
  2: '#a78bfa',
  3: '#22c55e',
  4: '#06b6d4',
  5: '#3b82f6',
  6: '#ec4899',
};

function telegramFolderTagDefinition(
  accountId: string,
  folder: TelegramCrmMtprotoDialogFolder,
) {
  return {
    systemKey: `${TELEGRAM_FOLDER_TAG_PREFIX}${accountId}:${folder.id}`,
    name: folder.emoticon ? `${folder.emoticon} ${folder.title}` : folder.title,
    color:
      folder.color == null || folder.color < 0
        ? null
        : (telegramFolderColors[folder.color] ?? null),
    position: 300 + folder.id,
  };
}

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
      tag.systemKey?.startsWith('CHANNEL:') ||
      tag.systemKey?.startsWith(TELEGRAM_FOLDER_TAG_PREFIX)
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

  async syncTelegramFolderTags(
    input: {
      workspaceId: string;
      accountId: string;
      folders?: TelegramCrmMtprotoDialogFolder[];
      dialogs: TelegramCrmMtprotoDialog[];
      contactIdByTelegramUserId: Map<string, string | null>;
    },
    db: DbClient = this.prisma,
  ) {
    if (!input.folders) return;
    const definitions = input.folders.map((folder) =>
      telegramFolderTagDefinition(input.accountId, folder),
    );
    const systemKeys = definitions.map((definition) => definition.systemKey);
    const existing = systemKeys.length
      ? await db.telegramAdvertiserTag.findMany({
          where: {
            workspaceId: input.workspaceId,
            systemKey: { in: systemKeys },
          },
          select: {
            id: true,
            systemKey: true,
            name: true,
            color: true,
            position: true,
          },
        })
      : [];
    const existingByKey = new Map(
      existing.flatMap((tag) => (tag.systemKey ? [[tag.systemKey, tag]] : [])),
    );
    const missing = definitions.filter(
      (definition) => !existingByKey.has(definition.systemKey),
    );
    if (missing.length) {
      await db.telegramAdvertiserTag.createMany({
        data: missing.map((definition) => ({
          workspaceId: input.workspaceId,
          ...definition,
        })),
        skipDuplicates: true,
      });
    }
    const changed = definitions.filter((definition) => {
      const current = existingByKey.get(definition.systemKey);
      return (
        current &&
        (current.name !== definition.name ||
          current.color !== definition.color ||
          current.position !== definition.position)
      );
    });
    await Promise.all(
      changed.map((definition) =>
        db.telegramAdvertiserTag.updateMany({
          where: {
            workspaceId: input.workspaceId,
            systemKey: definition.systemKey,
          },
          data: {
            name: definition.name,
            color: definition.color,
            position: definition.position,
          },
        }),
      ),
    );
    const tags = systemKeys.length
      ? await db.telegramAdvertiserTag.findMany({
          where: {
            workspaceId: input.workspaceId,
            systemKey: { in: systemKeys },
          },
          select: { id: true, systemKey: true },
        })
      : [];
    const tagIdByFolderId = new Map(
      tags.flatMap((tag) => {
        const folderId = tag.systemKey?.split(':').at(-1);
        return folderId ? [[Number(folderId), tag.id]] : [];
      }),
    );
    const desired = new Map<string, Set<string>>();
    for (const dialog of input.dialogs) {
      const contactId = input.contactIdByTelegramUserId.get(
        dialog.peer.telegramUserId,
      );
      if (!contactId) continue;
      const tagIds = (dialog.folderIds ?? []).flatMap((folderId) => {
        const tagId = tagIdByFolderId.get(folderId);
        return tagId ? [tagId] : [];
      });
      if (tagIds.length) desired.set(contactId, new Set(tagIds));
      else if (!desired.has(contactId)) desired.set(contactId, new Set());
    }
    const contactIds = [...desired.keys()];
    if (!contactIds.length) return;
    const prefix = `${TELEGRAM_FOLDER_TAG_PREFIX}${input.accountId}:`;
    const current = await db.telegramAdvertiserTagAssignment.findMany({
      where: {
        workspaceId: input.workspaceId,
        advertiserId: { in: contactIds },
        tag: { systemKey: { startsWith: prefix } },
      },
      select: { advertiserId: true, tagId: true },
    });
    const currentKeys = new Set(
      current.map(
        (assignment) => `${assignment.advertiserId}:${assignment.tagId}`,
      ),
    );
    const wanted = [...desired.entries()].flatMap(([advertiserId, tagIds]) =>
      [...tagIds].map((tagId) => ({ advertiserId, tagId })),
    );
    const wantedKeys = new Set(
      wanted.map(
        (assignment) => `${assignment.advertiserId}:${assignment.tagId}`,
      ),
    );
    const stale = current.filter(
      (assignment) =>
        !wantedKeys.has(`${assignment.advertiserId}:${assignment.tagId}`),
    );
    if (stale.length) {
      await db.telegramAdvertiserTagAssignment.deleteMany({
        where: {
          workspaceId: input.workspaceId,
          OR: stale.map((assignment) => ({
            advertiserId: assignment.advertiserId,
            tagId: assignment.tagId,
          })),
        },
      });
    }
    const missingAssignments = wanted.filter(
      (assignment) =>
        !currentKeys.has(`${assignment.advertiserId}:${assignment.tagId}`),
    );
    if (missingAssignments.length) {
      await db.telegramAdvertiserTagAssignment.createMany({
        data: missingAssignments.map((assignment) => ({
          workspaceId: input.workspaceId,
          ...assignment,
        })),
        skipDuplicates: true,
      });
    }
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

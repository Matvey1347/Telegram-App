import { Prisma } from '@prisma/client';
import { resolveAiPostingPreferenceIcons } from './telegram-ai-posting-preference-icons';
import type {
  TelegramAiPostingDraftClassification,
  TelegramManagedPostEditorialPair,
} from '@telegram-system/shared';

import {
  databasePostingLengthId,
  localPostingLengthId,
} from './telegram-ai-posting-length-id';

type ChannelScope = { workspaceId: string; telegramChannelId: string };

export function editorialDraftWhere(
  scope: ChannelScope,
): Prisma.TelegramManagedPostWhereInput {
  return {
    ...scope,
    status: 'DRAFT',
    origin: 'SYSTEM',
    adSalePlacements: { none: {} },
    mutualPromotionDelivery: { is: null },
    postBatchDelivery: { is: null },
    OR: [{ group: null }, { group: { isSystem: false, systemKey: null } }],
  };
}

// Read tags against the current taxonomy. Deleted or moved rubrics make the
// old pair unclassified, without rewriting publication records on settings save.
export async function readManagedDraftEditorialPairs(
  db: Prisma.TransactionClient,
  scope: ChannelScope,
  postIds: string[],
) {
  if (!postIds.length) return [];
  const rows = await db.$queryRaw<Array<TelegramManagedPostEditorialPair & { sphereEmoji: string; rubricEmoji: string; sphereIconId: string | null; rubricIconId: string | null }>>`
    SELECT p.id AS "postId", s.id AS "sphereId", s.name AS "sphereName",
           r.id AS "rubricId", r.name AS "rubricName", s.emoji AS "sphereEmoji", r.emoji AS "rubricEmoji", s."emojiIconId" AS "sphereIconId", r."emojiIconId" AS "rubricIconId"
    FROM "TelegramManagedPost" p
    JOIN "TelegramAiPostingSphere" s ON s.id = p."aiPostingSphereId"
      AND s."workspaceId" = p."workspaceId"
      AND s."telegramChannelId" = p."telegramChannelId"
    JOIN "TelegramAiPostingRubric" r ON r.id = p."aiPostingRubricId"
      AND r."workspaceId" = p."workspaceId"
      AND r."telegramChannelId" = p."telegramChannelId"
      AND (r."sphereId" IS NULL OR r."sphereId" = s.id)
    WHERE p."workspaceId" = ${scope.workspaceId}
      AND p."telegramChannelId" = ${scope.telegramChannelId}
      AND p.id = ANY(${postIds}::text[])
      AND p.status = 'DRAFT'
      AND p.origin = 'SYSTEM'
      AND NOT EXISTS (
        SELECT 1 FROM "PostGroup" g WHERE g.id = p."groupId"
          AND (g."isSystem" OR g."systemKey" IS NOT NULL)
      )
      AND NOT EXISTS (SELECT 1 FROM "TelegramAdSalePlacement" a WHERE a."managedPostId" = p.id)
      AND NOT EXISTS (SELECT 1 FROM "MutualPromotionPostDelivery" v WHERE v."managedPostId" = p.id)
      AND NOT EXISTS (SELECT 1 FROM "TelegramPostBatchDelivery" b WHERE b."managedPostId" = p.id)
  `;
  const icons = await resolveAiPostingPreferenceIcons(db as import('../../../prisma/prisma.service').PrismaService, scope.workspaceId, {
    spheres: rows.map((row) => ({ emojiIconId: row.sphereIconId })),
    rubrics: rows.map((row) => ({ emojiIconId: row.rubricIconId })),
  });
  return rows.map(({ sphereEmoji, rubricEmoji, sphereIconId, rubricIconId, ...row }) => ({
    ...row,
    sphereIcon: (sphereIconId && icons[sphereIconId]) || { type: 'unicode' as const, value: sphereEmoji, name: null },
    rubricIcon: (rubricIconId && icons[rubricIconId]) || { type: 'unicode' as const, value: rubricEmoji, name: null },
  }));
}

export async function resolveEditorialDraftClassification(
  db: Prisma.TransactionClient,
  scope: ChannelScope,
  classification: TelegramAiPostingDraftClassification,
) {
  const { sphereId, rubricId, lengthId } = classification;
  const dbLengthId = lengthId
    ? databasePostingLengthId(
        scope.telegramChannelId,
        localPostingLengthId(scope.telegramChannelId, lengthId),
      )
    : null;
  const [validated] = await db.$queryRaw<
    Array<{
      aiPostingSphereId: string;
      aiPostingRubricId: string;
      aiPostingLengthId: string | null;
    }>
  >`
    SELECT s.id AS "aiPostingSphereId", r.id AS "aiPostingRubricId",
           l.id AS "aiPostingLengthId"
    FROM "TelegramAiPostingSphere" s
    JOIN "TelegramAiPostingRubric" r ON r.id = ${rubricId}
      AND r."workspaceId" = s."workspaceId"
      AND r."telegramChannelId" = s."telegramChannelId"
      AND (r."sphereId" IS NULL OR r."sphereId" = s.id)
    LEFT JOIN "TelegramAiPostingRubricLength" a ON a."rubricId" = r.id
      AND a."lengthId" = ${dbLengthId}
    LEFT JOIN "TelegramAiPostingLength" l ON l.id = a."lengthId"
      AND l."workspaceId" = s."workspaceId"
      AND l."telegramChannelId" = s."telegramChannelId"
    WHERE s.id = ${sphereId}
      AND s."workspaceId" = ${scope.workspaceId}
      AND s."telegramChannelId" = ${scope.telegramChannelId}
  `;
  return validated ?? null;
}

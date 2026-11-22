import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TelegramUnifiedImportEditorial } from '@telegram-system/shared';
import { randomUUID } from 'node:crypto';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';

export const importedEditorialName = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

export async function resolveImportedEditorial(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  telegramChannelId: string,
  editorial: TelegramUnifiedImportEditorial,
) {
  const sphereName = importedEditorialName(editorial.sphere);
  const rubricName = importedEditorialName(editorial.rubric);
  if (!sphereName || !rubricName)
    throw new BadRequestException('Sphere and rubric names are required');

  const scope = { workspaceId, telegramChannelId };
  await acquirePostgresTransactionLock(
    tx,
    `ai-posting-structure:${workspaceId}:${telegramChannelId}`,
  );
  const spheres = await tx.telegramAiPostingSphere.findMany({
    where: { ...scope, name: { equals: sphereName, mode: 'insensitive' } },
    select: { id: true },
    take: 2,
  });
  if (spheres.length > 1)
    throw new BadRequestException(`Ambiguous sphere: ${sphereName}`);
  const sphere =
    spheres[0] ??
    (await tx.telegramAiPostingSphere.create({
      data: {
        ...scope,
        id: randomUUID(),
        name: sphereName,
        description: editorial.sphereDescription?.trim(),
      },
      select: { id: true },
    }));
  const rubrics = await tx.telegramAiPostingRubric.findMany({
    where: {
      ...scope,
      name: { equals: rubricName, mode: 'insensitive' },
      OR: [{ sphereId: sphere.id }, { sphereId: null }],
    },
    select: { id: true, sphereId: true },
  });
  const scoped = rubrics.filter((rubric) => rubric.sphereId === sphere.id);
  const applicable = scoped.length ? scoped : rubrics;
  if (applicable.length > 1)
    throw new BadRequestException(`Ambiguous rubric: ${rubricName}`);
  let rubric = applicable[0];
  if (!rubric) {
    const lengths = await tx.telegramAiPostingLength.findMany({
      where: scope,
      select: { id: true },
    });
    rubric = await tx.telegramAiPostingRubric.create({
      data: {
        ...scope,
        id: randomUUID(),
        sphereId: sphere.id,
        name: rubricName,
        description: editorial.rubricDescription?.trim(),
        lengths: { create: lengths.map(({ id: lengthId }) => ({ lengthId })) },
      },
      select: { id: true, sphereId: true },
    });
  }
  return {
    aiPostingSphereId: sphere.id,
    aiPostingRubricId: rubric.id,
    aiPostingLengthId: null,
  };
}

export async function readImportedEditorialCatalog(
  db: Prisma.TransactionClient,
  workspaceId: string,
  telegramChannelId: string,
) {
  const where = { workspaceId, telegramChannelId };
  const [spheres, rubrics] = await Promise.all([
    db.telegramAiPostingSphere.findMany({
      where,
      select: { id: true, name: true, parentId: true, description: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    db.telegramAiPostingRubric.findMany({
      where,
      select: {
        id: true,
        name: true,
        sphereId: true,
        description: true,
        goal: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
  ]);
  return { spheres, rubrics };
}

export function previewImportedEditorial(
  editorial: TelegramUnifiedImportEditorial,
  catalog: Awaited<ReturnType<typeof readImportedEditorialCatalog>> | undefined,
) {
  const sphereName = importedEditorialName(editorial.sphere);
  const rubricName = importedEditorialName(editorial.rubric);
  if (!sphereName || !rubricName)
    return {
      errors: ['Sphere and rubric names are required'],
      description: null,
    };
  const matches = (left: string, right: string) =>
    left.toLowerCase() === right.toLowerCase();
  const spheres =
    catalog?.spheres.filter((s) => matches(s.name, sphereName)) ?? [];
  const sphere = spheres[0];
  const rubrics =
    catalog?.rubrics.filter(
      (r) =>
        matches(r.name, rubricName) &&
        (r.sphereId === null || r.sphereId === sphere?.id),
    ) ?? [];
  const scoped = rubrics.filter((r) => r.sphereId === sphere?.id);
  const applicable = scoped.length ? scoped : rubrics;
  return {
    errors: [
      ...(spheres.length > 1 ? [`Ambiguous sphere: ${sphereName}`] : []),
      ...(applicable.length > 1 ? [`Ambiguous rubric: ${rubricName}`] : []),
    ],
    description: `${sphere?.name ?? sphereName} → ${applicable[0]?.name ?? rubricName}`,
    createsSphere: !sphere,
    createsRubric: applicable.length === 0,
  };
}

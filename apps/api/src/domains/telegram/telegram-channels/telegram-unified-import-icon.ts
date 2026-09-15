import { PrismaService } from '../../../prisma/prisma.service';

export async function resolveUnifiedImportHypothesisIconId(
  prisma: PrismaService,
  workspaceId: string,
  userId: string,
  rawIcon: string | null | undefined,
  fallbackIconId: string | null | undefined,
  title: string,
) {
  if (rawIcon === undefined) return fallbackIconId;
  const icon = rawIcon?.trim();
  if (!icon) return null;
  const existingById = await prisma.icon.findFirst({
    where: { id: icon, OR: [{ workspaceId }, { workspaceId: null }] },
    select: { id: true },
  });
  if (existingById) return existingById.id;
  const existingByEmoji = await prisma.icon.findFirst({
    where: { workspaceId, type: 'emoji', emoji: icon },
    select: { id: true },
  });
  if (existingByEmoji) return existingByEmoji.id;
  return (
    await prisma.icon.create({
      data: {
        workspaceId,
        type: 'emoji',
        name: `${title.trim()} · ${icon}`,
        emoji: icon,
        createdByUserId: userId,
      },
      select: { id: true },
    })
  ).id;
}

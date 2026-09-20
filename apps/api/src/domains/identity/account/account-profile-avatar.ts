import type { IconType, Prisma } from '@prisma/client';

export type ProfileAvatarSource = {
  type: IconType;
  emoji: string | null;
  imageUrl: string | null;
};

export async function saveGlobalProfileAvatar(
  tx: Prisma.TransactionClient,
  userId: string,
  source: ProfileAvatarSource,
) {
  const name = `profile-avatar:${userId}`;
  const existing = await tx.icon.findFirst({
    where: { workspaceId: null, createdByUserId: userId, name },
    select: { id: true },
  });
  const data = {
    type: source.type,
    emoji: source.emoji,
    imageUrl: source.imageUrl,
  };
  if (existing) {
    return tx.icon.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }
  return tx.icon.create({
    data: {
      workspaceId: null,
      createdByUserId: userId,
      name,
      ...data,
    },
    select: { id: true },
  });
}

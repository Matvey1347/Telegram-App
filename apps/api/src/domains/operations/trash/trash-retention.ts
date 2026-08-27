export const TRASH_RETENTION_DAYS = 90;
export const TRASH_DAY_MS = 86_400_000;

export function trashExpiresAt(deletedAt: Date) {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * TRASH_DAY_MS);
}

export function trashDaysRemaining(deletedAt: Date, now = new Date()) {
  return Math.max(
    0,
    Math.ceil(
      (trashExpiresAt(deletedAt).getTime() - now.getTime()) / TRASH_DAY_MS,
    ),
  );
}

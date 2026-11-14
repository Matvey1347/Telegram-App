export function trackingLinkTitle(current: string, lastAutomatic: string | null, name?: string) {
  const next = name?.trim();
  return next && (!current.trim() || current === lastAutomatic) ? next : null;
}

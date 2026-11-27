import type { CrossPromotionPlan } from "@telegram-system/shared";

type Slot = { telegramChannelId: string; scheduledAt: string; telegramAdProductId?: string | null };
type PublicationSlots = { id: string; placements: Slot[] };

function scheduleKey(publications: PublicationSlots[]) {
  return JSON.stringify(publications.map(({ id, placements }) => [
    id,
    placements.map(({ telegramChannelId, scheduledAt, telegramAdProductId }) =>
      JSON.stringify([telegramChannelId, Date.parse(scheduledAt), telegramAdProductId || null]),
    ).sort(),
  ]));
}

export function promotionScheduleChanged(plan: CrossPromotionPlan, desired: PublicationSlots[]) {
  return scheduleKey(plan.publicationPost.publisherPublications?.length
    ? plan.publicationPost.publisherPublications
    : [{ id: "publisher-1", placements: plan.publicationPost.publisherPlacements ??
      plan.publisherChannelIds.map((telegramChannelId) => ({ telegramChannelId, scheduledAt: plan.scheduledAt })) }],
  ) !== scheduleKey(desired);
}

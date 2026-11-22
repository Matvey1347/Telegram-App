type Placement = {
  publicationId?: string | null;
  telegramChannelId: string;
  isPublishedInTelegram?: boolean;
};

export type CrossPromotionChannelAction = {
  label: string;
  variant: "danger" | "primary";
  onClick: () => void;
};

export function buildCrossPromotionChannelActions({
  channelIds,
  placements,
  publicationId,
  onUpdate,
  onReplace,
}: {
  channelIds: string[];
  placements: Placement[];
  publicationId: string;
  onUpdate?: (publicationId: string, channelId: string) => void;
  onReplace?: (publicationId: string, channelId: string) => void;
}): Record<string, CrossPromotionChannelAction> {
  return Object.fromEntries(
    channelIds.flatMap((channelId) => {
      const placement = placements.find(
        (item) =>
          item.publicationId === publicationId &&
          item.telegramChannelId === channelId,
      );
      if (!placement) return [];
      const published = Boolean(placement.isPublishedInTelegram);
      return [
        [
          channelId,
          {
            label: published
              ? "Delete current post & schedule again"
              : "Update",
            variant: published ? "danger" : "primary",
            onClick: () =>
              published
                ? onReplace?.(publicationId, channelId)
                : onUpdate?.(publicationId, channelId),
          } satisfies CrossPromotionChannelAction,
        ],
      ];
    }),
  );
}

export function parseAdsChannelIds(value?: string | null) {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function adsChannelWhere(
  telegramChannelId?: string | null,
  telegramChannelIds?: string | null,
) {
  const channelIds = parseAdsChannelIds(telegramChannelIds);
  if (channelIds.length) return { in: channelIds };
  return telegramChannelId || undefined;
}

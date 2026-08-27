type ChannelCurrency = {
  kpiCurrency?: string | null;
};

export function resolveMajorityChannelCurrency(
  channels: ChannelCurrency[],
  fallbackCurrency: string,
) {
  const fallback = fallbackCurrency.trim().toUpperCase() || 'USD';
  const counts = new Map<string, number>();

  for (const channel of channels) {
    const currency = channel.kpiCurrency?.trim().toUpperCase() || fallback;
    counts.set(currency, (counts.get(currency) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort(
    ([leftCurrency, leftCount], [rightCurrency, rightCount]) =>
      rightCount - leftCount ||
      Number(rightCurrency === fallback) - Number(leftCurrency === fallback) ||
      leftCurrency.localeCompare(rightCurrency),
  );

  return ranked[0]?.[0] ?? fallback;
}

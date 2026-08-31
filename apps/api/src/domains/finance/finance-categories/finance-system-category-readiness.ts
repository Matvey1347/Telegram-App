type FinanceSystemCategory = {
  key: string | null;
  name: string;
  isSystem: boolean;
  icon?: { name: string; emoji: string | null } | null;
};

const EXPECTED = [
  { key: 'investment', name: 'Investment' },
  {
    key: 'channel_advertising_revenue',
    name: 'Channel Advertising Revenue',
    iconName: 'channel-advertising-revenue',
    emoji: '👛',
  },
  {
    key: 'telegram_ad_sales_reversal',
    name: 'Telegram Ad Sales Reversal',
    iconName: 'telegram-ad-sales-reversal',
    emoji: '↩️',
  },
  { key: 'advertising', name: 'Advertising' },
  { key: 'buy_channels', name: 'Buy Channels' },
  {
    key: 'salary',
    name: 'Salary',
    iconName: 'salary',
    emoji: '💼',
  },
] as const;

export function financeSystemCategoriesReady(
  categories: FinanceSystemCategory[],
) {
  const legacyAdSales = categories.some(
    (category) =>
      category.key === 'telegram_ad_sales' ||
      category.name.trim().toLowerCase() === 'telegram ad sales',
  );
  const duplicateBuyChannels =
    categories.filter(
      (category) =>
        category.key === 'buy_channels' ||
        category.name.trim().toLowerCase() === 'buy channels',
    ).length > 1;
  if (legacyAdSales || duplicateBuyChannels) return false;

  const byKey = new Map(categories.map((category) => [category.key, category]));
  return EXPECTED.every((expected) => {
    const category = byKey.get(expected.key);
    if (!category || !category.isSystem || category.name !== expected.name) {
      return false;
    }
    if (!('iconName' in expected)) return true;
    return (
      category.icon?.name === expected.iconName &&
      category.icon.emoji === expected.emoji
    );
  });
}

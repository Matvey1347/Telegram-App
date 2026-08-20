import type { ResolvedEmoji } from '@telegram-system/shared';

export function systemBotEmoji(
  presentation: ResolvedEmoji | null | undefined,
  fallback: string,
) {
  return presentation?.type === 'unicode' ? presentation.value : fallback;
}

export function systemBotTaskEmoji(taskKey: string) {
  if (taskKey.includes('channels')) return '📢';
  if (taskKey.includes('post_metrics')) return '📈';
  if (taskKey.includes('broadcast_stats')) return '📊';
  if (taskKey.includes('analytics')) return '🧮';
  if (taskKey.includes('currencies')) return '💱';
  return '⚙️';
}

type SystemBotStatsSummary = {
  totalBalancePrimary?: number;
  totalBalanceSecondary?: number;
  primaryCurrency?: string;
  secondaryCurrency?: string;
  incomeForPeriod?: number;
  expensesForPeriod?: number;
  profitForPeriod?: number;
  telegramChannelsCount?: number;
  ownChannelsCount?: number;
  externalChannelsCount?: number;
  workspaceMembersCount?: number;
  totalSubscribers?: number;
  activeSubscribersEstimate?: number;
  campaignsCount?: number;
  periodCampaignsCount?: number;
  accountBalances?: Array<{
    name: string;
    currency: string;
    balance: number;
    iconPresentation?: ResolvedEmoji | null;
  }>;
  topOwnChannels?: Array<{
    title: string;
    subscribers: number;
    photoUrl?: string | null;
  }>;
};

function formatNumber(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function renderSystemBotStats(
  workspaceName: string,
  summary: SystemBotStatsSummary,
) {
  const lines = [
    `📊 Statistics: ${workspaceName}`,
    typeof summary.totalBalancePrimary === 'number'
      ? `💰 Balance: ${formatNumber(summary.totalBalancePrimary)} ${summary.primaryCurrency ?? ''}`.trim()
      : null,
    typeof summary.totalBalanceSecondary === 'number' &&
    summary.secondaryCurrency
      ? `💱 Secondary balance: ${formatNumber(summary.totalBalanceSecondary)} ${summary.secondaryCurrency}`
      : null,
    typeof summary.incomeForPeriod === 'number'
      ? `📈 Income: ${formatNumber(summary.incomeForPeriod)} ${summary.primaryCurrency ?? ''}`.trim()
      : null,
    typeof summary.expensesForPeriod === 'number'
      ? `📉 Expenses: ${formatNumber(summary.expensesForPeriod)} ${summary.primaryCurrency ?? ''}`.trim()
      : null,
    typeof summary.profitForPeriod === 'number'
      ? `🧾 Profit: ${formatNumber(summary.profitForPeriod)} ${summary.primaryCurrency ?? ''}`.trim()
      : null,
    typeof summary.telegramChannelsCount === 'number'
      ? `📢 Channels: ${summary.telegramChannelsCount} (own ${summary.ownChannelsCount ?? 0}, external ${summary.externalChannelsCount ?? 0})`
      : null,
    typeof summary.totalSubscribers === 'number'
      ? `👥 Subscribers: ${formatNumber(summary.totalSubscribers)}`
      : null,
    typeof summary.activeSubscribersEstimate === 'number'
      ? `🟢 Active audience: ${formatNumber(summary.activeSubscribersEstimate)}`
      : null,
    typeof summary.campaignsCount === 'number'
      ? `📣 Campaigns: ${summary.campaignsCount} (${summary.periodCampaignsCount ?? 0} in period)`
      : null,
    typeof summary.workspaceMembersCount === 'number'
      ? `👤 Workspace members: ${summary.workspaceMembersCount}`
      : null,
  ].filter((line): line is string => Boolean(line));

  if (summary.accountBalances?.length) {
    lines.push(
      '',
      '🏦 Accounts:',
      ...summary.accountBalances
        .slice(0, 5)
        .map(
          (account) =>
            `${systemBotEmoji(account.iconPresentation, '💳')} ${account.name}: ${formatNumber(account.balance)} ${account.currency}`,
        ),
    );
  }
  if (summary.topOwnChannels?.length) {
    lines.push(
      '',
      '🏆 Top channels:',
      ...summary.topOwnChannels
        .slice(0, 5)
        .map(
          (channel) =>
            `${channel.photoUrl ? '🖼️' : '📢'} ${channel.title}: ${formatNumber(channel.subscribers)} subscribers`,
        ),
    );
  }
  return lines.join('\n');
}

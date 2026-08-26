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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderSystemBotStats(
  workspaceName: string,
  summary: SystemBotStatsSummary,
) {
  const primaryCurrency = escapeHtml(summary.primaryCurrency ?? '');
  const lines = [
    `📊 <b>${escapeHtml(workspaceName)}</b>`,
    '<b>Finance</b>',
    typeof summary.totalBalancePrimary === 'number'
      ? `💰 Balance: <b>${formatNumber(summary.totalBalancePrimary)} ${primaryCurrency}</b>`.trim()
      : null,
    typeof summary.totalBalanceSecondary === 'number' &&
    summary.secondaryCurrency
      ? `💱 Secondary: <b>${formatNumber(summary.totalBalanceSecondary)} ${escapeHtml(summary.secondaryCurrency)}</b>`
      : null,
    typeof summary.incomeForPeriod === 'number'
      ? `📈 Income: ${formatNumber(summary.incomeForPeriod)} ${primaryCurrency}`.trim()
      : null,
    typeof summary.expensesForPeriod === 'number'
      ? `📉 Expenses: ${formatNumber(summary.expensesForPeriod)} ${primaryCurrency}`.trim()
      : null,
    typeof summary.profitForPeriod === 'number'
      ? `${summary.profitForPeriod >= 0 ? '✅' : '🔻'} Profit: <b>${formatNumber(summary.profitForPeriod)} ${primaryCurrency}</b>`.trim()
      : null,
    '',
    '<b>Channels and audience</b>',
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
      '<b>Accounts</b>',
      ...summary.accountBalances
        .slice(0, 5)
        .map(
          (account) =>
            `${systemBotEmoji(account.iconPresentation, '💳')} ${escapeHtml(account.name)}: ${formatNumber(account.balance)} ${escapeHtml(account.currency)}`,
        ),
    );
  }
  if (summary.topOwnChannels?.length) {
    lines.push(
      '',
      '<b>Top channels</b>',
      ...summary.topOwnChannels
        .slice(0, 5)
        .map(
          (channel) =>
            `${channel.photoUrl ? '🖼️' : '📢'} ${escapeHtml(channel.title)}: ${formatNumber(channel.subscribers)} subscribers`,
        ),
    );
  }
  return lines.join('\n');
}

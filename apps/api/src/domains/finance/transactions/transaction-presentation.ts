import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  withWorkspaceMemberAvatar,
  type WorkspaceMemberAvatarSource,
} from '../../../common/workspace-member-presentation';

export const isBuyChannelsCategory = (category: {
  key?: string | null;
  name?: string | null;
  type: 'income' | 'expense';
}) => {
  const name = String(category.name ?? '')
    .trim()
    .toLowerCase();
  return (
    category.type === 'expense' &&
    (category.key === 'buy_channels' ||
      name === 'buy channels' ||
      name === 'buy channels (legacy)')
  );
};

export const isChannelAdvertisingRevenueCategory = (category: {
  key?: string | null;
  name?: string | null;
  type: 'income' | 'expense';
}) => {
  const name = String(category.name ?? '')
    .trim()
    .toLowerCase();
  return (
    category.type === 'income' &&
    (category.key === 'channel_advertising_revenue' ||
      name === 'channel advertising revenue')
  );
};

export const withTransactionIconPresentation = <
  T extends {
    icon?: Parameters<typeof iconToResolvedEmoji>[0];
    account?: {
      icon?: Parameters<typeof iconToResolvedEmoji>[0];
      assignedMember?: WorkspaceMemberAvatarSource | null;
    } | null;
    categoryRef?: { icon?: Parameters<typeof iconToResolvedEmoji>[0] } | null;
    member?: WorkspaceMemberAvatarSource | null;
    assignedMember?: WorkspaceMemberAvatarSource | null;
  },
>(
  transaction: T,
) => ({
  ...transaction,
  iconPresentation: iconToResolvedEmoji(transaction.icon),
  account: transaction.account
    ? {
        ...transaction.account,
        iconPresentation: iconToResolvedEmoji(transaction.account.icon),
        assignedMember: withWorkspaceMemberAvatar(
          transaction.account.assignedMember,
        ),
      }
    : transaction.account,
  categoryRef: transaction.categoryRef
    ? {
        ...transaction.categoryRef,
        iconPresentation: iconToResolvedEmoji(transaction.categoryRef.icon),
      }
    : transaction.categoryRef,
  member: withWorkspaceMemberAvatar(transaction.member),
  assignedMember: withWorkspaceMemberAvatar(transaction.assignedMember),
});

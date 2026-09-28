import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';

type Icon = Parameters<typeof iconToResolvedEmoji>[0];

type MemberResponseRow = {
  userId: string;
  avatarIcon?: Icon;
  roleDefinition?: {
    id: string;
    name: string;
    systemKey: string | null;
    icon: Icon;
  } | null;
  salesCommissionRate?: unknown;
};

export function toWorkspaceMemberResponse<T extends MemberResponseRow>(
  row: T,
  currentUserId: string,
) {
  const roleDefinition = row.roleDefinition;
  return {
    ...row,
    salesCommissionRate:
      row.salesCommissionRate != null ? Number(row.salesCommissionRate) : null,
    avatarPresentation: iconToResolvedEmoji(row.avatarIcon),
    roleDefinition: roleDefinition
      ? {
          id: roleDefinition.id,
          name: roleDefinition.name,
          systemKey: roleDefinition.systemKey === 'OWNER' ? 'OWNER' : null,
          iconPresentation: iconToResolvedEmoji(roleDefinition.icon),
        }
      : null,
    isCurrentUser: row.userId === currentUserId,
  };
}

import { iconToResolvedEmoji } from './icons/resolved-emoji';

export type WorkspaceMemberAvatarSource = {
  avatarIcon?: Parameters<typeof iconToResolvedEmoji>[0];
  [key: string]: unknown;
};

export function withWorkspaceMemberAvatar(member: WorkspaceMemberAvatarSource | null | undefined) {
  if (!member) return member;
  return {
    ...member,
    avatarPresentation: iconToResolvedEmoji(member.avatarIcon),
  };
}

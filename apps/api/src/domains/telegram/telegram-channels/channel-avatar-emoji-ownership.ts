/** Avatar presentation is available for channels managed in this workspace. */
export function channelAvatarEmojiAdminAccessWhere(workspaceId?: string) {
  return {
    ...(workspaceId ? { workspaceId } : {}),
    sourceType: 'MTPROTO' as const,
    role: { in: ['OWNER', 'ADMIN'] as ('OWNER' | 'ADMIN')[] },
  };
}

export function channelAvatarEmojiManagedChannelWhere(workspaceId: string) {
  return {
    workspaceId,
    sourceAccesses: { some: channelAvatarEmojiAdminAccessWhere(workspaceId) },
  };
}

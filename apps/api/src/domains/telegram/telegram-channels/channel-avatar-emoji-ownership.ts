/** A linked administrator is not evidence that this workspace owns a channel. */
export function channelAvatarEmojiOwnerAccessWhere(workspaceId?: string) {
  return {
    ...(workspaceId ? { workspaceId } : {}),
    sourceType: 'MTPROTO' as const,
    role: 'OWNER' as const,
  };
}

export function channelAvatarEmojiOwnedChannelWhere(workspaceId: string) {
  return {
    workspaceId,
    sourceAccesses: { some: channelAvatarEmojiOwnerAccessWhere(workspaceId) },
  };
}

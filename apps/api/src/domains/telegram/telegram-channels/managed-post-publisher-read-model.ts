const iconSelect = {
  id: true,
  type: true,
  name: true,
  emoji: true,
  imageUrl: true,
} as const;

const memberSummarySelect = {
  id: true,
  role: true,
  telegramUsername: true,
  avatarIconId: true,
  avatarIcon: { select: iconSelect },
  user: { select: { id: true, name: true } },
} as const;

export const managedPostPublisherInclude = {
  assignedMember: { select: memberSummarySelect },
  group: {
    select: {
      id: true,
      workspaceId: true,
      telegramChannelId: true,
      title: true,
      icon: true,
      isSystem: true,
      systemKey: true,
      statusNumberingEnabled: true,
      sidebarPosition: true,
    },
  },
} as const;

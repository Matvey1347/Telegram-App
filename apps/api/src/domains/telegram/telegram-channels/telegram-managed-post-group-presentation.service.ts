import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeTelegramPostButtonRows } from '../../../telegram/shared/telegram-inline-keyboard';
import {
  ADVERTISE_SYSTEM_GROUP_ICON,
  ADVERTISE_SYSTEM_GROUP_KEY,
  SYSTEM_BOT_POSTS_GROUP_ICON_IMAGE_URL,
  SYSTEM_BOT_POSTS_GROUP_ICON_NAME,
  SYSTEM_BOT_POSTS_GROUP_KEY,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_NAME,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY,
  TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE,
} from './telegram-channels.internal';

@Injectable()
export class TelegramManagedPostGroupPresentationService {
  constructor(private readonly prisma: PrismaService) {}

  private telegramSystemGroupIconId: string | undefined;

  private readonly iconSelect = {
    id: true,
    type: true,
    name: true,
    emoji: true,
    imageUrl: true,
  } as const;

  private legacyUnicodeIconPresentation(value?: string | null) {
    if (!value || !/\p{Extended_Pictographic}/u.test(value)) return null;
    return iconToResolvedEmoji({
      id: value,
      type: 'emoji',
      name: value,
      emoji: value,
      imageUrl: null,
    });
  }

  private systemGroupIconPresentation(
    group?: {
      systemKey?: string | null;
    } | null,
  ) {
    if (group?.systemKey === SYSTEM_BOT_POSTS_GROUP_KEY) {
      return iconToResolvedEmoji({
        id: SYSTEM_BOT_POSTS_GROUP_ICON_NAME,
        type: 'image',
        name: SYSTEM_BOT_POSTS_GROUP_ICON_NAME,
        emoji: null,
        imageUrl: SYSTEM_BOT_POSTS_GROUP_ICON_IMAGE_URL,
      });
    }
    if (group?.systemKey === ADVERTISE_SYSTEM_GROUP_KEY) {
      return iconToResolvedEmoji({
        id: ADVERTISE_SYSTEM_GROUP_ICON,
        type: 'emoji',
        name: ADVERTISE_SYSTEM_GROUP_ICON,
        emoji: ADVERTISE_SYSTEM_GROUP_ICON,
        imageUrl: null,
      });
    }
    return null;
  }

  public async resolveTelegramImportedSystemGroupIconId(): Promise<string> {
    if (this.telegramSystemGroupIconId !== undefined) {
      return this.telegramSystemGroupIconId;
    }

    const iconClient = (this.prisma as { icon?: typeof this.prisma.icon }).icon;
    if (!iconClient) {
      this.telegramSystemGroupIconId =
        TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID;
      return TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID;
    }

    const existingIcon = await iconClient.findFirst({
      where: {
        workspaceId: null,
        type: 'image',
        name: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_NAME,
      },
      select: { id: true },
    });

    if (existingIcon) {
      this.telegramSystemGroupIconId = existingIcon.id;
      return existingIcon.id;
    }

    try {
      const createdIcon = await iconClient.create({
        data: {
          workspaceId: null,
          type: 'image',
          name: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_NAME,
          imageUrl: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL,
        },
        select: { id: true },
      });
      this.telegramSystemGroupIconId = createdIcon.id;
      return createdIcon.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const createdIcon = await iconClient.findFirst({
          where: {
            workspaceId: null,
            type: 'image',
            name: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_NAME,
          },
          select: { id: true },
        });
        if (createdIcon) {
          this.telegramSystemGroupIconId = createdIcon.id;
          return createdIcon.id;
        }
      }
      throw error;
    }
  }

  public async resolveTelegramImportedSystemGroupIconPresentation() {
    return iconToResolvedEmoji({
      id:
        this.telegramSystemGroupIconId ||
        TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_FALLBACK_ID,
      type: 'image',
      name: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_NAME,
      imageUrl: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL,
      emoji: null,
    });
  }

  public isTelegramImportedSystemGroup(
    group?: {
      isSystem?: boolean | null;
      systemKey?: string | null;
      title?: string | null;
    } | null,
  ) {
    return (
      group?.systemKey === TELEGRAM_IMPORTED_SYSTEM_GROUP_KEY ||
      (group?.isSystem === true &&
        group?.title === TELEGRAM_IMPORTED_SYSTEM_GROUP_TITLE)
    );
  }

  public isSystemGroupIconCandidate(
    group?: {
      icon?: string | null;
      isSystem?: boolean | null;
      systemKey?: string | null;
      title?: string | null;
    } | null,
    hasResolvedIcon = false,
  ) {
    return this.isTelegramImportedSystemGroup(group) && !hasResolvedIcon;
  }

  public memberSummary<
    T extends {
      avatarIcon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
    },
  >(member: T) {
    const { avatarIcon, ...rest } = member;
    return {
      ...rest,
      avatarPresentation: iconToResolvedEmoji(avatarIcon),
    };
  }

  public async loadIconsByIds(
    workspaceId: string,
    iconIds: Array<string | null | undefined>,
  ) {
    const ids = [...new Set(iconIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length)
      return new Map<
        string,
        {
          id: string;
          type: 'emoji' | 'image';
          name: string;
          emoji: string | null;
          imageUrl: string | null;
        }
      >();
    const icons = await this.prisma.icon.findMany({
      where: {
        id: { in: ids },
        OR: [{ workspaceId }, { workspaceId: null }],
      },
      select: this.iconSelect,
    });
    return new Map(icons.map((icon) => [icon.id, icon]));
  }

  public async attachManagedPostIcons<
    T extends {
      workspaceId: string;
      icon?: string | null;
      buttonRows?: unknown;
      assignedMember?: {
        avatarIcon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
      } | null;
      group?: {
        icon?: string | null;
        isSystem?: boolean | null;
        systemKey?: string | null;
        title?: string | null;
        [key: string]: unknown;
      } | null;
    },
  >(posts: T[]) {
    const workspaceId = posts[0]?.workspaceId;
    const fallbackSystemGroupIcon =
      await this.resolveTelegramImportedSystemGroupIconPresentation();
    const iconsById = workspaceId
      ? await this.loadIconsByIds(workspaceId, [
          ...posts.map((post) => post.icon),
          ...posts.map((post) =>
            typeof post.group?.icon === 'string' ? post.group.icon : null,
          ),
        ])
      : new Map();
    return posts.map((post) => ({
      ...post,
      buttonRows: normalizeTelegramPostButtonRows(post.buttonRows),
      assignedMember: post.assignedMember
        ? this.memberSummary(post.assignedMember)
        : post.assignedMember,
      iconPresentation: post.icon
        ? iconToResolvedEmoji(iconsById.get(post.icon))
        : null,
      group: post.group
        ? {
            ...post.group,
            iconPresentation:
              typeof post.group.icon === 'string'
                ? (iconToResolvedEmoji(iconsById.get(post.group.icon)) ??
                  this.legacyUnicodeIconPresentation(post.group.icon) ??
                  this.systemGroupIconPresentation(post.group) ??
                  (this.isSystemGroupIconCandidate(
                    post.group,
                    Boolean(iconsById.get(post.group.icon)),
                  )
                    ? fallbackSystemGroupIcon
                    : null))
                : (this.systemGroupIconPresentation(post.group) ??
                  (this.isSystemGroupIconCandidate(post.group, false)
                    ? fallbackSystemGroupIcon
                    : null)),
          }
        : post.group,
    }));
  }

  public async attachPostGroupIcons<
    T extends {
      workspaceId: string;
      icon?: string | null;
      isSystem?: boolean | null;
      systemKey?: string | null;
      title?: string | null;
      createdByMember?: {
        avatarIcon?: Parameters<typeof iconToResolvedEmoji>[0] | null;
      } | null;
      posts?: Array<{ icon?: string | null }>;
    },
  >(groups: T[]) {
    const workspaceId = groups[0]?.workspaceId;
    const nestedPostIcons = groups.flatMap((group) =>
      (group.posts ?? []).map((post) => post.icon),
    );
    const fallbackSystemGroupIcon =
      await this.resolveTelegramImportedSystemGroupIconPresentation();
    const iconsById = workspaceId
      ? await this.loadIconsByIds(workspaceId, [
          ...groups.map((group) => group.icon),
          ...nestedPostIcons,
        ])
      : new Map();
    return groups.map((group) => ({
      ...group,
      createdByMember: group.createdByMember
        ? this.memberSummary(group.createdByMember)
        : group.createdByMember,
      iconPresentation: group.icon
        ? (iconToResolvedEmoji(iconsById.get(group.icon)) ??
          this.legacyUnicodeIconPresentation(group.icon) ??
          this.systemGroupIconPresentation(group) ??
          (this.isSystemGroupIconCandidate(
            group,
            Boolean(group.icon && iconsById.get(group.icon)),
          )
            ? fallbackSystemGroupIcon
            : null))
        : (this.systemGroupIconPresentation(group) ??
          (this.isSystemGroupIconCandidate(group, false)
            ? fallbackSystemGroupIcon
            : null)),
      posts: group.posts
        ? group.posts.map((post) => ({
            ...post,
            iconPresentation: post.icon
              ? iconToResolvedEmoji(iconsById.get(post.icon))
              : null,
          }))
        : group.posts,
    }));
  }
}

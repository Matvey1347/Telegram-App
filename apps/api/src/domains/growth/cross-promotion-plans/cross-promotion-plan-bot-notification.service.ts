import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CrossPromotionChannelPlacementInput,
  CrossPromotionPlacementPost,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';
import { renderPublicationConfirmation } from '../../telegram/telegram-system-bot/telegram-system-bot-publication-confirmation';

type ScheduledPlacement = CrossPromotionChannelPlacementInput;
type Publication = {
  id: string | null;
  title: string;
  placements: ScheduledPlacement[];
};
type PublishedPost = {
  telegramChannelId: string;
  telegramMessageUrls: string[];
  publicationId?: string | null;
  scheduledAt?: string;
  deleteAt?: string | null;
};
type StoredPlacement = {
  telegramChannelId: string;
  managedPostId: string;
  publicationId?: string | null;
};
type Channel = {
  id: string;
  title: string;
  publicInviteLink: { url: string } | null;
  defaultInviteLink: { url: string } | null;
  presentationIcon: { emoji: string | null } | null;
};

const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

@Injectable()
export class CrossPromotionPlanBotNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    @Inject(forwardRef(() => TelegramSystemBotNotificationsService))
    private readonly notifications: TelegramSystemBotNotificationsService,
  ) {}

  async send(userId: string, id: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const message = await this.renderScheduledMessage(workspaceId, id);
    return this.notifications.sendToWorkspaceUser({
      workspaceId,
      userId,
      text: message.text,
      parseMode: 'HTML',
    });
  }

  async preview(userId: string, id: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    return this.renderScheduledMessage(workspaceId, id);
  }

  async sendPublicationConfirmation(input: {
    workspaceId: string;
    userId: string;
    title: string;
    publicationPost: unknown;
    posts: PublishedPost[];
  }) {
    const publicationPost = json<CrossPromotionPlacementPost>(
      input.publicationPost,
      { title: '', text: '', imageUrls: [], buttonRows: [] },
    );
    const publications = publisherPublications(publicationPost, input.title);
    const channels = await this.channelsFor(
      input.workspaceId,
      input.posts.map((post) => post.telegramChannelId),
    );
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    return this.notifications.sendToWorkspaceUser({
      workspaceId: input.workspaceId,
      userId: input.userId,
      parseMode: 'HTML',
      text: publishedMessage(
        publications,
        input.posts,
        byId,
        await this.workspaceTimezone(input.workspaceId),
      ),
    });
  }

  private async renderScheduledMessage(workspaceId: string, id: string) {
    const plan = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        title: true,
        publicationPost: true,
        placementPostIds: true,
        workspace: { select: { timezone: true } },
      },
    });
    if (!plan) throw new NotFoundException('Cross-promotion plan not found');
    const post = json<CrossPromotionPlacementPost>(plan.publicationPost, {
      title: '',
      text: '',
      imageUrls: [],
      buttonRows: [],
    });
    const publications = publisherPublications(post, plan.title);
    const placements = publications.flatMap(
      (publication) => publication.placements,
    );
    if (!placements.length) {
      throw new BadRequestException('This promotion has no scheduled channels');
    }
    const channels = await this.channelsFor(
      workspaceId,
      placements.map((placement) => placement.telegramChannelId),
    );
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    const stored = json<StoredPlacement[]>(plan.placementPostIds, []);
    const managedPosts = stored.length
      ? await this.prisma.telegramManagedPost.findMany({
          where: {
            workspaceId,
            id: { in: stored.map((placement) => placement.managedPostId) },
          },
          select: {
            id: true,
            status: true,
            telegramChannelId: true,
            telegramMessageUrls: true,
          },
        })
      : [];
    const allPublished =
      stored.length === placements.length &&
      managedPosts.length === stored.length &&
      managedPosts.every((managedPost) => managedPost.status === 'PUBLISHED');
    if (allPublished) {
      const publishedPosts = publishedPostsForStoredPlacements(
        publications,
        stored,
        managedPosts,
      );
      return {
        text: publishedMessage(
          publications,
          publishedPosts,
          byId,
          plan.workspace.timezone,
        ),
      };
    }
    return {
      text: renderPublicationConfirmation({
        state: 'scheduled',
        channels,
        timezone: plan.workspace.timezone,
        groups: publications.map((publication) => ({
          title: publication.title,
          placements: publication.placements,
        })),
      }),
    };
  }

  private channelsFor(workspaceId: string, channelIds: string[]) {
    return this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: [...new Set(channelIds)] } },
      select: {
        id: true,
        title: true,
        publicInviteLink: { select: { url: true } },
        defaultInviteLink: { select: { url: true } },
        presentationIcon: { select: { emoji: true } },
      },
    }) as Promise<Channel[]>;
  }

  private async workspaceTimezone(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { timezone: true },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return workspace.timezone;
  }
}

function publisherPublications(
  post: CrossPromotionPlacementPost,
  planTitle: string,
): Publication[] {
  if (post.publisherPublications?.length) {
    return post.publisherPublications.map((publication) => ({
      id: publication.id,
      title: postTitle(publication.post?.title, planTitle),
      placements: publication.placements,
    }));
  }
  return [
    {
      id: null,
      title: postTitle(post.title, planTitle),
      placements: post.publisherPlacements ?? [],
    },
  ];
}

function publishedPostsForStoredPlacements(
  publications: Publication[],
  stored: StoredPlacement[],
  managedPosts: Array<{
    id: string;
    telegramChannelId: string;
    telegramMessageUrls: string[];
  }>,
): PublishedPost[] {
  const configured = publications.flatMap((publication) =>
    publication.placements.map((placement) => ({
      publicationId: publication.id,
      placement,
    })),
  );
  const managedById = new Map(managedPosts.map((post) => [post.id, post]));
  const consumed = new Set<number>();
  return stored.flatMap((storedPlacement, storedIndex) => {
    const managedPost = managedById.get(storedPlacement.managedPostId);
    if (!managedPost) return [];
    const matchingIndex = configured.findIndex(
      (item, index) =>
        !consumed.has(index) &&
        item.placement.telegramChannelId === managedPost.telegramChannelId &&
        (storedPlacement.publicationId == null ||
          item.publicationId === storedPlacement.publicationId),
    );
    const fallbackIndex =
      matchingIndex >= 0
        ? matchingIndex
        : Math.min(storedIndex, Math.max(0, configured.length - 1));
    const matched = configured[fallbackIndex];
    if (matched) consumed.add(fallbackIndex);
    return [
      {
        telegramChannelId: managedPost.telegramChannelId,
        telegramMessageUrls: managedPost.telegramMessageUrls,
        publicationId: storedPlacement.publicationId ?? matched?.publicationId,
        scheduledAt: matched?.placement.scheduledAt,
        deleteAt: matched?.placement.deleteAt,
      },
    ];
  });
}

function publishedMessage(
  publications: Publication[],
  posts: PublishedPost[],
  channels: Map<string, Channel>,
  timezone: string,
) {
  const groups = publications.map((publication) => ({
    title: publication.title,
    placements: posts.filter(
      (post) =>
        (publication.id == null && !post.publicationId) ||
        post.publicationId === publication.id,
    ),
  }));
  if (!groups.some((group) => group.placements.length) && posts.length) {
    groups.push({ title: 'Опубліковані пости', placements: posts });
  }
  return renderPublicationConfirmation({
    state: 'published',
    groups,
    channels: [...channels.values()],
    timezone,
  });
}

function postTitle(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

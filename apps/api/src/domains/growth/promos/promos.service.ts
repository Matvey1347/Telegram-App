import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { withWorkspaceMemberAvatar } from '../../../common/workspace-member-presentation';
import { CreatePromoDto, PromoQueryDto, UpdatePromoDto } from './dto';
import { Prisma, PromoStatus } from '@prisma/client';
import { adsChannelWhere } from '../ads-channel-scope';

const PROMO_PREVIEW_TEXT_MAX_LENGTH = 360;

const promoDetailSelect = {
  id: true,
  workspaceId: true,
  telegramChannelId: true,
  iconId: true,
  title: true,
  text: true,
  previewText: true,
  previewImageUrl: true,
  plainText: true,
  formattedHtml: true,
  angle: true,
  imageData: true,
  imageUrls: true,
  mediaItems: true,
  buttonRows: true,
  defaultInviteLinkId: true,
  status: true,
  assignedMemberId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  telegramChannel: {
    select: { id: true, title: true, username: true, photoUrl: true },
  },
  defaultInviteLink: {
    select: {
      id: true,
      telegramChannelId: true,
      adCampaignId: true,
      name: true,
      url: true,
      joinedCount: true,
      requestedCount: true,
      isRevoked: true,
      expireDate: true,
      memberLimit: true,
      createsJoinRequest: true,
      creatorTelegramUserId: true,
      creatorUsername: true,
      creatorFirstName: true,
      creatorLastName: true,
      creatorPhotoUrl: true,
      creatorMatchSource: true,
      creatorMember: WorkspaceService.assignedMemberInclude,
    },
  },
  icon: true,
  assignedMember: WorkspaceService.assignedMemberInclude,
  createdByUser: WorkspaceService.createdByUserInclude,
} satisfies Prisma.PromoSelect;

function promoPreviewText(input: {
  plainText?: string | null;
  text?: string | null;
}) {
  const value = input.plainText?.trim() || input.text?.trim();
  return value ? value.slice(0, PROMO_PREVIEW_TEXT_MAX_LENGTH) : null;
}

function promoPreviewImageUrl(input: {
  imageData?: string | null;
  imageUrls?: string[] | null;
  mediaItems?: unknown;
}) {
  const mediaPhoto = Array.isArray(input.mediaItems)
    ? input.mediaItems.find((item): item is { kind: 'PHOTO'; url: string } =>
        Boolean(
          item &&
          typeof item === 'object' &&
          (item as { kind?: unknown }).kind === 'PHOTO' &&
          typeof (item as { url?: unknown }).url === 'string',
        ),
      )?.url
    : undefined;
  const value = [mediaPhoto, ...(input.imageUrls ?? []), input.imageData]
    .find(
      (candidate) =>
        typeof candidate === 'string' &&
        Boolean(candidate.trim()) &&
        !candidate.trim().startsWith('data:'),
    )
    ?.trim();
  return value || null;
}

@Injectable()
export class PromosService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private configService: ConfigService,
  ) {}
  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }
  private async validateChannelAndInviteLink(
    workspaceId: string,
    telegramChannelId: string,
    defaultInviteLinkId?: string | null,
  ) {
    const [channel, inviteLink] = await Promise.all([
      this.prisma.telegramChannel.findFirst({
        where: { id: telegramChannelId, workspaceId, archivedAt: null },
        select: { id: true },
      }),
      defaultInviteLinkId
        ? this.prisma.telegramInviteLink.findFirst({
            where: {
              id: defaultInviteLinkId,
              telegramChannelId,
              workspaceId,
              isRevoked: false,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!channel) throw new NotFoundException('Telegram channel not found');
    if (defaultInviteLinkId && !inviteLink) {
      throw new NotFoundException('Channel invite link not found');
    }
  }
  async findAll(userId: string, query: PromoQueryDto = {}) {
    const workspaceId = await this.workspace(userId);
    const search = query.search?.trim();
    const matchingStatuses = search
      ? Object.values(PromoStatus).filter((status) =>
          status.toLowerCase().includes(search.toLowerCase()),
        )
      : [];
    const where: Prisma.PromoWhereInput = {
      workspaceId,
      telegramChannel: { workspaceId, archivedAt: null },
      telegramChannelId: adsChannelWhere(
        query.telegramChannelId,
        query.telegramChannelIds,
      ),
      assignedMemberId: query.assignedMemberId || undefined,
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { text: { contains: search, mode: 'insensitive' } },
              ...(matchingStatuses.length
                ? [{ status: { in: matchingStatuses } }]
                : []),
              {
                telegramChannel: {
                  workspaceId,
                  OR: [
                    { title: { contains: search, mode: 'insensitive' } },
                    { username: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
    const pagination = normalizePagination(query);
    const [items, totalItems] = await this.prisma.$transaction([
      this.prisma.promo.findMany({
        where,
        select: {
          id: true,
          workspaceId: true,
          telegramChannelId: true,
          iconId: true,
          title: true,
          previewText: true,
          previewImageUrl: true,
          status: true,
          assignedMemberId: true,
          createdAt: true,
          updatedAt: true,
          telegramChannel: {
            select: { id: true, title: true, username: true, photoUrl: true },
          },
          icon: true,
          assignedMember: WorkspaceService.assignedMemberInclude,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.promo.count({ where }),
    ]);
    return createPaginatedResponse(
      items.map((item) => ({
        ...item,
        iconPresentation: iconToResolvedEmoji(item.icon),
        assignedMember: withWorkspaceMemberAvatar(item.assignedMember),
      })),
      totalItems,
      pagination,
    );
  }
  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.promo.findFirst({
      where: {
        id,
        workspaceId,
        telegramChannel: { workspaceId, archivedAt: null },
      },
      select: promoDetailSelect,
    });
    if (!row) throw new NotFoundException('Promo not found');
    return {
      ...row,
      iconPresentation: iconToResolvedEmoji(row.icon),
      assignedMember: withWorkspaceMemberAvatar(row.assignedMember),
    };
  }
  async create(userId: string, dto: CreatePromoDto) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const iconId = await this.resolveIconId(workspaceId, dto.iconId);
    await this.validateChannelAndInviteLink(
      workspaceId,
      dto.telegramChannelId,
      dto.defaultInviteLinkId,
    );
    const promo = await this.prisma.promo.create({
      data: {
        workspaceId,
        ...dto,
        mediaItems: dto.mediaItems,
        buttonRows: dto.buttonRows,
        iconId,
        assignedMemberId,
        createdByUserId: userId,
        text: dto.text ?? '',
        previewText: promoPreviewText(dto),
        previewImageUrl: promoPreviewImageUrl(dto),
      },
      select: promoDetailSelect,
    });
    return {
      ...promo,
      iconPresentation: iconToResolvedEmoji(promo.icon),
      assignedMember: withWorkspaceMemberAvatar(promo.assignedMember),
    };
  }
  async update(userId: string, id: string, dto: UpdatePromoDto) {
    const existing = await this.findOne(userId, id);
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const iconId =
      dto.iconId === undefined
        ? undefined
        : await this.resolveIconId(existing.workspaceId, dto.iconId);
    const telegramChannelId =
      dto.telegramChannelId ?? existing.telegramChannelId;
    const defaultInviteLinkId =
      dto.defaultInviteLinkId === undefined
        ? existing.defaultInviteLinkId
        : dto.defaultInviteLinkId;
    const contentChanged =
      dto.text !== undefined || dto.plainText !== undefined;
    const mediaChanged =
      dto.mediaItems !== undefined ||
      dto.imageUrls !== undefined ||
      dto.imageData !== undefined;
    await this.validateChannelAndInviteLink(
      existing.workspaceId,
      telegramChannelId,
      defaultInviteLinkId,
    );
    const promo = await this.prisma.promo.update({
      where: { id },
      data: {
        ...dto,
        mediaItems: dto.mediaItems,
        buttonRows: dto.buttonRows,
        imageData:
          dto.imageData !== undefined
            ? dto.imageData
            : dto.mediaItems !== undefined || dto.imageUrls !== undefined
              ? null
              : undefined,
        iconId,
        assignedMemberId,
        previewText: contentChanged
          ? promoPreviewText({
              text: dto.text ?? existing.text,
              plainText:
                dto.plainText !== undefined
                  ? dto.plainText
                  : dto.text !== undefined
                    ? null
                    : existing.plainText,
            })
          : undefined,
        previewImageUrl: mediaChanged
          ? promoPreviewImageUrl({
              mediaItems: dto.mediaItems ?? existing.mediaItems,
              imageUrls: dto.imageUrls ?? existing.imageUrls,
              imageData:
                dto.imageData !== undefined
                  ? dto.imageData
                  : dto.mediaItems !== undefined || dto.imageUrls !== undefined
                    ? null
                    : existing.imageData,
            })
          : undefined,
      },
      select: promoDetailSelect,
    });
    return {
      ...promo,
      iconPresentation: iconToResolvedEmoji(promo.icon),
      assignedMember: withWorkspaceMemberAvatar(promo.assignedMember),
    };
  }
  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.promo.delete({ where: { id } });
  }

  async uploadPromoImage(file: Express.Multer.File) {
    const keyId = this.configService.get<string>('B2_KEY_ID')?.trim();
    const appKey = this.configService.get<string>('B2_APP_KEY')?.trim();
    const bucketName = this.configService.get<string>('B2_BUCKET_NAME')?.trim();
    const endpoint = this.configService.get<string>('B2_ENDPOINT')?.trim();

    if (!keyId || !appKey || !bucketName) {
      throw new InternalServerErrorException(
        'B2 env vars missing: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME',
      );
    }

    const authHeader = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    const authRes = await fetch(
      'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      {
        method: 'GET',
        headers: { Authorization: `Basic ${authHeader}` },
      },
    );
    if (!authRes.ok) {
      throw new InternalServerErrorException(
        'Failed to authorize Backblaze B2',
      );
    }
    const authData = (await authRes.json()) as {
      apiUrl: string;
      authorizationToken: string;
      downloadUrl: string;
      accountId: string;
    };

    const listBucketsRes = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_list_buckets`,
      {
        method: 'POST',
        headers: {
          Authorization: authData.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: authData.accountId,
          bucketName,
        }),
      },
    );
    if (!listBucketsRes.ok) {
      throw new InternalServerErrorException('Failed to resolve B2 bucket');
    }
    const listBucketsData = (await listBucketsRes.json()) as {
      buckets?: Array<{ bucketId: string; bucketName: string }>;
    };
    const bucket = listBucketsData.buckets?.find(
      (b) => b.bucketName === bucketName,
    );
    if (!bucket?.bucketId) {
      throw new InternalServerErrorException(
        `B2 bucket not found: ${bucketName}`,
      );
    }

    const uploadUrlRes = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_get_upload_url`,
      {
        method: 'POST',
        headers: {
          Authorization: authData.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketId: bucket.bucketId }),
      },
    );
    if (!uploadUrlRes.ok) {
      throw new InternalServerErrorException('Failed to get B2 upload URL');
    }
    const uploadUrlData = (await uploadUrlRes.json()) as {
      uploadUrl: string;
      authorizationToken: string;
    };

    const extension =
      file.originalname
        ?.split('.')
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `promos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

    const uploadRes = await fetch(uploadUrlData.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadUrlData.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': file.mimetype || 'b2/x-auto',
        'Content-Length': String(file.size),
        'X-Bz-Content-Sha1': 'do_not_verify',
      },
      body: new Uint8Array(file.buffer),
    });
    if (!uploadRes.ok) {
      throw new InternalServerErrorException('Failed to upload image to B2');
    }

    if (!endpoint) {
      return `${authData.downloadUrl}/file/${bucketName}/${fileName}`;
    }

    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const s3HostLike = /(^https?:\/\/)?s3\./i.test(cleanEndpoint);
    const hasBucketInPath = new RegExp(`/${bucketName}(/|$)`, 'i').test(
      cleanEndpoint,
    );

    // Backblaze S3 endpoint usually needs bucket in URL path.
    if (s3HostLike && !hasBucketInPath) {
      return `${cleanEndpoint}/${bucketName}/${fileName}`;
    }

    return `${cleanEndpoint}/${fileName}`;
  }

  private async resolveIconId(
    workspaceId: string,
    rawIconId: string | null | undefined,
  ) {
    const iconId = rawIconId?.trim() || null;
    if (!iconId) return null;
    const icon = await this.prisma.icon.findFirst({
      where: {
        id: iconId,
        OR: [{ workspaceId }, { workspaceId: null }],
      },
      select: { id: true },
    });
    if (!icon) throw new NotFoundException('Icon not found');
    return iconId;
  }
}

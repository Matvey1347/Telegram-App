import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private shapeMembership(
    row: {
      id: string;
      workspaceId: string;
      role: WorkspaceRole;
      workspace: {
        id: string;
        name: string;
        timezone: string;
        primaryCurrency: string;
        secondaryCurrency: string;
        avatarIcon?: {
          id: string;
          type: 'emoji' | 'image';
          name: string;
          emoji?: string | null;
          imageUrl?: string | null;
        } | null;
        currencyDisplayMode?: 'code' | 'symbol';
      };
    },
    telegramAsset?: {
      kind: 'STATIC' | 'ANIMATED' | 'VIDEO';
      assetUrl: string | null;
      renderAssetUrl: string | null;
    } | null,
  ) {
    return {
      id: row.workspace.id,
      name: row.workspace.name,
      timezone: row.workspace.timezone,
      role: row.role,
      primaryCurrency: row.workspace.primaryCurrency,
      secondaryCurrency: row.workspace.secondaryCurrency,
      currencyDisplayMode: row.workspace.currencyDisplayMode ?? 'code',
      avatarIcon: row.workspace.avatarIcon ?? null,
      avatarPresentation: iconToResolvedEmoji(
        row.workspace.avatarIcon,
        telegramAsset,
      ),
    };
  }

  private async premiumEmojiAssets(
    rows: Array<{
      workspaceId: string;
      workspace: { avatarIcon?: Parameters<typeof iconToResolvedEmoji>[0] };
    }>,
  ) {
    const targets = rows.flatMap((row) => {
      const presentation = iconToResolvedEmoji(row.workspace.avatarIcon);
      return presentation?.type === 'unicode' &&
        presentation.telegramCustomEmojiId
        ? [
            {
              workspaceId: row.workspaceId,
              documentId: presentation.telegramCustomEmojiId,
            },
          ]
        : [];
    });
    if (!targets.length) return new Map<string, never>();
    const assets = await this.prisma.telegramCustomEmoji.findMany({
      where: {
        documentId: {
          in: [...new Set(targets.map((target) => target.documentId))],
        },
      },
      select: {
        documentId: true,
        kind: true,
        assetUrl: true,
        renderAssetUrl: true,
        pack: { select: { workspaceId: true } },
      },
    });
    const resolved = new Map<
      string,
      {
        kind: 'STATIC' | 'ANIMATED' | 'VIDEO';
        assetUrl: string | null;
        renderAssetUrl: string | null;
      }
    >();
    for (const asset of assets) {
      const presentation = {
        kind: asset.kind as 'STATIC' | 'ANIMATED' | 'VIDEO',
        assetUrl: asset.assetUrl,
        renderAssetUrl: asset.renderAssetUrl,
      };
      resolved.set(
        `${asset.pack.workspaceId}:${asset.documentId}`,
        presentation,
      );
      // Telegram Custom Emoji document IDs are global. Reuse an already stored
      // immutable Telegram asset when another workspace selected the same emoji.
      if (!resolved.has(`*:${asset.documentId}`))
        resolved.set(`*:${asset.documentId}`, presentation);
    }
    return resolved;
  }

  async findAll(userId: string) {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            timezone: true,
            primaryCurrency: true,
            secondaryCurrency: true,
            avatarIcon: {
              select: {
                id: true,
                type: true,
                name: true,
                emoji: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const premiumAssets = await this.premiumEmojiAssets(rows);
    return rows.map((row) => {
      const presentation = iconToResolvedEmoji(row.workspace.avatarIcon);
      return this.shapeMembership(
        {
          ...row,
          workspace: {
            ...row.workspace,
            currencyDisplayMode: 'code',
          },
        },
        premiumAssets.get(
          `${row.workspaceId}:${presentation?.type === 'unicode' ? presentation.telegramCustomEmojiId : ''}`,
        ) ??
          premiumAssets.get(
            `*:${presentation?.type === 'unicode' ? presentation.telegramCustomEmojiId : ''}`,
          ),
      );
    });
  }

  async findOne(userId: string, id: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: id },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            timezone: true,
            primaryCurrency: true,
            secondaryCurrency: true,
            avatarIcon: {
              select: {
                id: true,
                type: true,
                name: true,
                emoji: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    const premiumAssets = await this.premiumEmojiAssets([membership]);
    const presentation = iconToResolvedEmoji(membership.workspace.avatarIcon);
    return this.shapeMembership(
      {
        ...membership,
        workspace: {
          ...membership.workspace,
          currencyDisplayMode: 'code',
        },
      },
      premiumAssets.get(
        `${membership.workspaceId}:${presentation?.type === 'unicode' ? presentation.telegramCustomEmojiId : ''}`,
      ) ??
        premiumAssets.get(
          `*:${presentation?.type === 'unicode' ? presentation.telegramCustomEmojiId : ''}`,
        ),
    );
  }

  async create(userId: string, dto: CreateWorkspaceDto) {
    const name = dto.name.trim();
    const workspaceId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "Workspace" (
            "id",
            "name",
            "timezone",
            "primaryCurrency",
            "secondaryCurrency",
            "createdAt",
            "updatedAt"
          )
          VALUES (${workspaceId}, ${name}, 'Europe/Warsaw', 'USD', 'UAH', NOW(), NOW())
        `,
      );
      await tx.workspaceMember.create({
        data: {
          userId,
          workspaceId,
          role: WorkspaceRole.owner,
        },
      });
    });

    return {
      id: workspaceId,
      name,
      timezone: 'Europe/Warsaw',
      role: WorkspaceRole.owner,
      primaryCurrency: 'USD',
      secondaryCurrency: 'UAH',
      currencyDisplayMode: 'code',
      avatarIcon: null,
    };
  }

  async update(userId: string, id: string, dto: UpdateWorkspaceDto) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: id },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (
      membership.role !== WorkspaceRole.owner &&
      membership.role !== WorkspaceRole.admin
    ) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    if (
      dto.name === undefined &&
      dto.avatarIconId === undefined &&
      dto.timezone === undefined
    ) {
      return this.findOne(userId, id);
    }
    if (dto.avatarIconId !== undefined && dto.avatarIconId !== null) {
      const icon = await this.prisma.icon.findFirst({
        where: { id: dto.avatarIconId, workspaceId: id },
      });
      if (!icon) throw new NotFoundException('Icon not found');
    }
    await this.prisma.workspace.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        timezone: dto.timezone?.trim(),
        avatarIconId:
          dto.avatarIconId === undefined ? undefined : dto.avatarIconId,
      },
    });
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: id },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (membership.role !== WorkspaceRole.owner) {
      throw new ForbiddenException('Only owner can delete workspace');
    }
    await this.prisma.workspace.delete({ where: { id } });
    return { success: true };
  }

  async selected(userId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    return this.shapeMembership(membership);
  }
}

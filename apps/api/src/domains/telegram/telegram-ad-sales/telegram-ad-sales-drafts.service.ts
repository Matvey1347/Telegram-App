import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { SaveTelegramAdSaleDraftDto } from './dto';

@Injectable()
export class TelegramAdSalesDraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  list(userId: string) {
    return this.workspace(userId).then((workspaceId) =>
      this.prisma.telegramAdSaleDraft.findMany({
        where: { workspaceId, createdByUserId: userId },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  async create(userId: string, dto: SaveTelegramAdSaleDraftDto) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.telegramAdSaleDraft.create({
      data: {
        workspaceId,
        createdByUserId: userId,
        title: dto.title?.trim() || null,
        payload: dto.payload as Prisma.InputJsonValue,
      },
    });
  }

  async update(userId: string, id: string, dto: SaveTelegramAdSaleDraftDto) {
    const workspaceId = await this.workspace(userId);
    const result = await this.prisma.telegramAdSaleDraft.updateMany({
      where: { id, workspaceId, createdByUserId: userId },
      data: {
        title: dto.title?.trim() || null,
        payload: dto.payload as Prisma.InputJsonValue,
      },
    });
    if (!result.count) throw new NotFoundException('Ad sale draft not found');
    return this.prisma.telegramAdSaleDraft.findUniqueOrThrow({ where: { id } });
  }

  async delete(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const result = await this.prisma.telegramAdSaleDraft.deleteMany({
      where: { id, workspaceId, createdByUserId: userId },
    });
    if (!result.count) throw new NotFoundException('Ad sale draft not found');
  }
}

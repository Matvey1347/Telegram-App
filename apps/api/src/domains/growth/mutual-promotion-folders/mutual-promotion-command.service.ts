import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  CreateMutualPromotionFolderDto,
  CreateMutualPromotionPostDto,
  MutualPromotionParticipantDto,
  UpdateMutualPromotionFolderDto,
  UpdateMutualPromotionPostDto,
} from './dto';
import { MutualPromotionReadService } from './mutual-promotion-read.service';
import { MutualPromotionActivationService } from './mutual-promotion-activation.service';
import { MutualPromotionExpenseService } from './mutual-promotion-expense.service';
import { MutualPromotionValidationService } from './mutual-promotion-validation.service';
import { TelegramManagedPostRemoteDeletionService } from '../../telegram/telegram-channels/telegram-managed-post-remote-deletion.service';
import {
  mutualPromotionFolderTitle,
  mutualPromotionImportedPostCount,
  mutualPromotionPostContent,
  mutualPromotionPostData,
  validateMutualPromotionPostTime,
} from './mutual-promotion-input';

@Injectable()
export class MutualPromotionCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly expenses: MutualPromotionExpenseService,
    private readonly activation: MutualPromotionActivationService,
    private readonly validation: MutualPromotionValidationService,
    private readonly read: MutualPromotionReadService,
    private readonly remoteDeletion: TelegramManagedPostRemoteDeletionService,
  ) {}

  async create(userId: string, dto: CreateMutualPromotionFolderDto) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const { startsAt, endsAt } = this.validation.parseInterval(
      dto.startsAt,
      dto.endsAt,
    );
    const assignedMemberId = await this.resolveAssignee(
      membership.workspaceId,
      dto.assignedMemberId,
    );
    const folder = await this.prisma.$transaction(async (tx) => {
      await this.validation.lockInviteLinks(
        tx,
        dto.participants.map((item) => item.inviteLinkId),
      );
      await this.validation.validateParticipants(tx, {
        workspaceId: membership.workspaceId,
        startsAt,
        endsAt,
        participants: dto.participants,
      });
      const created = await tx.mutualPromotionFolder.create({
        data: {
          workspaceId: membership.workspaceId,
          title: mutualPromotionFolderTitle(dto.title),
          titleTemplate: dto.titleTemplate?.trim() || null,
          startsAt,
          endsAt,
          notes: dto.notes?.trim() || null,
          assignedMemberId,
          createdByUserId: userId,
        },
      });
      await this.createParticipants(
        tx,
        created.id,
        membership.workspaceId,
        dto.participants,
      );
      return created;
    });
    return this.read.detailForWorkspace(membership.workspaceId, folder.id);
  }

  async update(
    userId: string,
    folderId: string,
    dto: UpdateMutualPromotionFolderDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const { startsAt, endsAt } = this.validation.parseInterval(
      dto.startsAt,
      dto.endsAt,
    );
    const assignedMemberId = await this.resolveAssignee(
      workspaceId,
      dto.assignedMemberId,
    );
    await this.prisma.$transaction(async (tx) => {
      await this.validation.lockFolder(tx, folderId);
      const current = await this.validation.requireFolder(
        workspaceId,
        folderId,
        tx,
      );
      this.validation.requireDraft(current.status);
      await this.validation.lockInviteLinks(
        tx,
        dto.participants.map((item) => item.inviteLinkId),
      );
      await this.validation.validateParticipants(tx, {
        workspaceId,
        folderId,
        startsAt,
        endsAt,
        participants: dto.participants,
      });
      const old = await tx.mutualPromotionFolderParticipant.findMany({
        where: { folderId },
        select: { id: true },
      });
      await tx.transaction.deleteMany({
        where: {
          mutualPromotionParticipantId: { in: old.map((row) => row.id) },
        },
      });
      await tx.mutualPromotionFolderParticipant.deleteMany({
        where: { folderId },
      });
      await tx.mutualPromotionFolder.update({
        where: { id: folderId },
        data: {
          title: mutualPromotionFolderTitle(dto.title),
          titleTemplate: dto.titleTemplate?.trim() || null,
          startsAt,
          endsAt,
          notes: dto.notes?.trim() || null,
          assignedMemberId,
        },
      });
      await this.createParticipants(
        tx,
        folderId,
        workspaceId,
        dto.participants,
      );
      const invalidPosts = await tx.mutualPromotionFolderPost.count({
        where: {
          folderId,
          OR: [
            { scheduledAt: { lt: startsAt } },
            { scheduledAt: { gte: endsAt } },
          ],
        },
      });
      if (invalidPosts) {
        throw new BadRequestException(
          'Every post time must stay inside the folder interval',
        );
      }
    });
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  async addPost(
    userId: string,
    folderId: string,
    dto: CreateMutualPromotionPostDto,
  ) {
    if (!dto.posts.length) {
      throw new BadRequestException('At least one post is required');
    }
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.validation.lockFolder(tx, folderId);
      const folder = await this.validation.requireFolder(
        workspaceId,
        folderId,
        tx,
      );
      this.validation.requireDraft(folder.status);
      const workflow = await tx.telegramSystemBotWorkflow.findFirst({
        where: {
          id: dto.importWorkflowId,
          workspaceId,
          kind: 'WEBSITE_POST_IMPORT',
          postImportMode: 'MULTIPLE',
          status: 'COMPLETED',
          consumedAt: null,
          resultManagedPostId: null,
          resultPostBatchPostId: null,
          resultAdSaleId: null,
          resultAdSalePlacementId: null,
          resultMutualPromotionPostId: null,
          postBatch: { is: null },
          connection: {
            is: { userId, enabled: true },
          },
        },
        select: { id: true, connectionId: true, payload: true },
      });
      if (!workflow) {
        throw new ConflictException(
          'A completed, unused System Bot import is required',
        );
      }
      if (
        dto.posts.length > mutualPromotionImportedPostCount(workflow.payload)
      ) {
        throw new BadRequestException(
          'The request contains more posts than the System Bot import',
        );
      }
      const position = await tx.mutualPromotionFolderPost.count({
        where: { folderId },
      });
      const postData = dto.posts.map((draft, index) =>
        mutualPromotionPostData(
          workflow.payload,
          workspaceId,
          folderId,
          validateMutualPromotionPostTime(
            draft.scheduledAt,
            folder.startsAt,
            folder.endsAt,
          ),
          position + index,
          draft,
        ),
      );
      const posts = await tx.mutualPromotionFolderPost.createManyAndReturn({
        data: postData,
        select: { id: true },
      });
      const consumed = await tx.telegramSystemBotWorkflow.updateMany({
        where: {
          id: workflow.id,
          connectionId: workflow.connectionId,
          workspaceId,
          connection: { is: { userId, enabled: true } },
          status: 'COMPLETED',
          consumedAt: null,
          resultManagedPostId: null,
          resultPostBatchPostId: null,
          resultAdSaleId: null,
          resultAdSalePlacementId: null,
          resultMutualPromotionPostId: null,
          postBatch: { is: null },
        },
        data: {
          resultMutualPromotionPostId: posts[0].id,
          consumedAt: new Date(),
        },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('System Bot import was already used');
      }
      return posts;
    });
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  async updatePost(
    userId: string,
    folderId: string,
    postId: string,
    dto: UpdateMutualPromotionPostDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.validation.lockFolder(tx, folderId);
      const folder = await this.validation.requireFolder(
        workspaceId,
        folderId,
        tx,
      );
      this.validation.requireDraft(folder.status);
      const scheduledAt = validateMutualPromotionPostTime(
        dto.scheduledAt,
        folder.startsAt,
        folder.endsAt,
      );
      const content = mutualPromotionPostContent(dto, 'Imported publication');
      const result = await tx.mutualPromotionFolderPost.updateMany({
        where: { id: postId, folderId, workspaceId },
        data: { scheduledAt, ...content },
      });
      if (!result.count)
        throw new NotFoundException('Mutual-promotion post not found');
    });
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  async removePost(userId: string, folderId: string, postId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.prisma.$transaction(async (tx) => {
      await this.validation.lockFolder(tx, folderId);
      const folder = await this.validation.requireFolder(
        workspaceId,
        folderId,
        tx,
      );
      this.validation.requireDraft(folder.status);
      const post = await tx.mutualPromotionFolderPost.findFirst({
        where: { id: postId, folderId, workspaceId },
        select: { id: true, position: true },
      });
      if (!post) throw new NotFoundException('Mutual-promotion post not found');
      await tx.mutualPromotionFolderPost.delete({ where: { id: postId } });
      const remaining = await tx.mutualPromotionFolderPost.findMany({
        where: { folderId, position: { gt: post.position } },
        orderBy: { position: 'asc' },
        select: { id: true, position: true },
      });
      for (const row of remaining) {
        await tx.mutualPromotionFolderPost.update({
          where: { id: row.id },
          data: { position: row.position - 1 },
        });
      }
    });
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  activate(
    userId: string,
    folderId: string,
    onProgress?: Parameters<MutualPromotionActivationService['activate']>[2],
  ) {
    return this.activation.activate(userId, folderId, onProgress);
  }

  async cancel(userId: string, folderId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.validation.lockFolder(tx, folderId);
      const folder = await this.validation.requireFolder(
        workspaceId,
        folderId,
        tx,
      );
      if (['COMPLETED', 'CANCELLED'].includes(folder.status)) {
        throw new BadRequestException('Folder is already terminal');
      }
      await tx.mutualPromotionWorkItem.updateMany({
        where: {
          folderId,
          kind: { in: ['CAPTURE_START_BASELINE', 'PUBLISH_POST'] },
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: { status: 'CANCELLED', completedAt: now },
      });
      await tx.mutualPromotionWorkItem.updateMany({
        where: {
          folderId,
          kind: 'FINISH_FOLDER',
          status: { in: ['PENDING', 'RETRY'] },
        },
        data: { nextAttemptAt: now, dueAt: now },
      });
      await tx.mutualPromotionFolder.update({
        where: { id: folderId },
        data: {
          status: folder.status === 'DRAFT' ? 'CANCELLED' : 'DELETING',
          cancelledAt: now,
          nextDueAt: folder.status === 'DRAFT' ? null : now,
        },
      });
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return this.read.detailForWorkspace(workspaceId, folderId);
  }

  async remove(userId: string, folderId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const folder = await this.prisma.mutualPromotionFolder.findFirst({
      where: { id: folderId, workspaceId },
      select: {
        id: true,
        posts: {
          select: {
            deliveries: {
              where: { managedPostId: { not: null } },
              select: {
                managedPostId: true,
                managedPost: {
                  select: {
                    status: true,
                    telegramMessageIds: true,
                    telegramScheduledMessageIds: true,
                    telegramRemoteStatus: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!folder)
      throw new NotFoundException('Mutual-promotion folder not found');
    const deliveries = folder.posts.flatMap((post) => post.deliveries);
    const managedPostIds = deliveries
      .map((delivery) => delivery.managedPostId)
      .filter((id): id is string => Boolean(id));
    const remotePostIds = deliveries
      .filter(
        (delivery) =>
          delivery.managedPost?.status === 'PUBLISHED' ||
          delivery.managedPost?.telegramMessageIds.length ||
          delivery.managedPost?.telegramScheduledMessageIds.length ||
          delivery.managedPost?.telegramRemoteStatus === 'AUTO_DELETED',
      )
      .map((delivery) => delivery.managedPostId!)
      .filter(Boolean);
    if (remotePostIds.length) {
      const result = await this.remoteDeletion.deletePublishedManagedPosts({
        workspaceId,
        managedPostIds: remotePostIds,
      });
      if (result.failed) {
        throw new BadRequestException(
          result.results.find((item) => !item.success)?.error ??
            'Telegram posts could not be deleted',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramManagedPost.deleteMany({
        where: { workspaceId, id: { in: managedPostIds } },
      });
      await tx.mutualPromotionFolder.delete({ where: { id: folderId } });
    });
    notifyScheduledTaskDueWorkChanged('mutual_promotion.lifecycle');
    return { id: folderId };
  }

  private async createParticipants(
    tx: Prisma.TransactionClient,
    folderId: string,
    workspaceId: string,
    participants: MutualPromotionParticipantDto[],
  ) {
    for (const input of participants) {
      const participant = await tx.mutualPromotionFolderParticipant.create({
        data: {
          workspaceId,
          folderId,
          telegramChannelId: input.telegramChannelId,
          inviteLinkId: input.inviteLinkId,
          role: input.role,
          inviteLinkMode: input.inviteLinkMode,
        },
      });
      if (input.expense) {
        await this.expenses.sync(tx, participant, input.expense);
      }
    }
  }

  private async resolveAssignee(
    workspaceId: string,
    assignedMemberId?: string | null,
  ) {
    if (!assignedMemberId) return null;
    const member = await this.prisma.workspaceMember.findFirst({
      where: { id: assignedMemberId, workspaceId },
      select: { id: true },
    });
    if (!member) {
      throw new BadRequestException(
        'Assigned member must belong to the workspace',
      );
    }
    return member.id;
  }
}

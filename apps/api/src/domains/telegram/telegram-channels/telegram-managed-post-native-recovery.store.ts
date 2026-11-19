import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ordinaryScheduledPostWhere } from './telegram-managed-post-rescheduler-repair';

export type NativeRecoveryIdentity = {
  workspaceId: string;
  channelId: string;
  postId: string;
  owner: string;
};
export type NativeRecoveryPrepareInput = NativeRecoveryIdentity & {
  sourceId: string;
  scheduledAt: Date;
  oldMessageIds: string[];
};

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((id, index) => id === right[index]);
const conflict = () =>
  new Error(
    'Native recovery evidence changed or requires reconciliation; no replay is permitted.',
  );

/** One latest replacement generation per post; uncertain remote outcomes never replay. */
@Injectable()
export class TelegramManagedPostNativeRecoveryStore {
  constructor(private readonly prisma: PrismaService) {}

  async read(postId: string, workspaceId: string, channelId: string) {
    try {
      return await this.prisma.telegramManagedPostNativeRecovery.findFirst({
        where: { postId, workspaceId, channelId },
      });
    } catch {
      throw new Error('Native recovery evidence could not be read.');
    }
  }

  async prepare(input: NativeRecoveryPrepareInput) {
    this.validateIds(input.oldMessageIds, true);
    if (
      !input.sourceId ||
      !Number.isFinite(input.scheduledAt.getTime()) ||
      input.scheduledAt <= new Date()
    )
      throw conflict();
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const live = this.livePost(input, now);
        const post = await tx.telegramManagedPost.findFirst({
          where: live,
          select: {
            sourceId: true,
            scheduledAt: true,
            telegramScheduledMessageIds: true,
          },
        });
        if (
          !post?.scheduledAt ||
          post.scheduledAt.getTime() !== input.scheduledAt.getTime() ||
          !sameIds(post.telegramScheduledMessageIds, input.oldMessageIds)
        )
          throw conflict();
        const prior = await tx.telegramManagedPostNativeRecovery.findUnique({
          where: { postId: input.postId },
        });
        if (
          prior &&
          (prior.workspaceId !== input.workspaceId ||
            prior.channelId !== input.channelId)
        )
          throw conflict();
        if (prior?.status === 'STARTED' || prior?.status === 'UNKNOWN')
          throw conflict();
        if (prior?.owner === input.owner) {
          if (
            prior.status === 'PREPARED' &&
            prior.sourceId === input.sourceId &&
            prior.scheduledAt.getTime() === input.scheduledAt.getTime() &&
            sameIds(prior.oldMessageIds, input.oldMessageIds)
          )
            return prior;
          throw conflict();
        }
        if (
          prior?.status === 'ACKED' &&
          (!prior.newMessageIds.length ||
            post.sourceId !== prior.sourceId ||
            !sameIds(post.telegramScheduledMessageIds, prior.newMessageIds) ||
            post.scheduledAt.getTime() !== prior.scheduledAt.getTime())
        )
          throw conflict();
        if (prior && !['PREPARED', 'ACKED', 'REJECTED'].includes(prior.status))
          throw conflict();
        const data = {
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          sourceId: input.sourceId,
          owner: input.owner,
          scheduledAt: input.scheduledAt,
          oldMessageIds: input.oldMessageIds,
          newMessageIds: [],
          status: 'PREPARED',
          cancelledAt: null,
        };
        if (!prior)
          return tx.telegramManagedPostNativeRecovery.create({
            data: { postId: input.postId, ...data },
          });
        const updated = await tx.telegramManagedPostNativeRecovery.updateMany({
          where: {
            postId: input.postId,
            workspaceId: input.workspaceId,
            channelId: input.channelId,
            owner: prior.owner,
            status: prior.status,
            updatedAt: prior.updatedAt,
            post: { is: live },
          },
          data,
        });
        if (updated.count !== 1) throw conflict();
        return tx.telegramManagedPostNativeRecovery.findUniqueOrThrow({
          where: { postId: input.postId },
        });
      });
    } catch {
      throw conflict();
    }
  }

  async start(input: NativeRecoveryIdentity) {
    try {
      const row = await this.prisma.telegramManagedPostNativeRecovery.findFirst(
        { where: { ...this.scope(input), status: 'PREPARED' } },
      );
      const now = new Date();
      if (!row || row.scheduledAt <= now) throw conflict();
      const updated =
        await this.prisma.telegramManagedPostNativeRecovery.updateMany({
          where: {
            ...this.scope(input),
            status: 'PREPARED',
            scheduledAt: { gt: now },
            post: {
              is: {
                ...this.livePost(input, now),
                scheduledAt: row.scheduledAt,
                telegramScheduledMessageIds: { equals: row.oldMessageIds },
              },
            },
          },
          data: { status: 'STARTED' },
        });
      if (updated.count !== 1) throw conflict();
      return { ...row, status: 'STARTED' };
    } catch {
      throw conflict();
    }
  }

  async cancelled(input: NativeRecoveryIdentity) {
    try {
      const changed =
        await this.prisma.telegramManagedPostNativeRecovery.updateMany({
          where: {
            ...this.scope(input),
            status: { in: ['PREPARED', 'STARTED', 'ACKED'] },
            cancelledAt: null,
          },
          data: { cancelledAt: new Date() },
        });
      if (!changed.count) {
        const row = await this.read(
          input.postId,
          input.workspaceId,
          input.channelId,
        );
        if (!row || row.owner !== input.owner || !row.cancelledAt)
          throw conflict();
      }
    } catch {
      throw conflict();
    }
  }

  async acknowledged(
    input: NativeRecoveryIdentity & { newMessageIds: string[] },
  ) {
    this.validateIds(input.newMessageIds, false);
    try {
      const changed =
        await this.prisma.telegramManagedPostNativeRecovery.updateMany({
          where: { ...this.scope(input), status: 'STARTED' },
          data: { status: 'ACKED', newMessageIds: input.newMessageIds },
        });
      if (!changed.count) {
        const row = await this.read(
          input.postId,
          input.workspaceId,
          input.channelId,
        );
        if (
          !row ||
          row.owner !== input.owner ||
          row.status !== 'ACKED' ||
          !sameIds(row.newMessageIds, input.newMessageIds)
        )
          throw conflict();
      }
    } catch {
      throw conflict();
    }
  }

  async failed(input: NativeRecoveryIdentity) {
    try {
      // Exact status CAS prevents a late error from replacing acknowledged IDs.
      await this.prisma.telegramManagedPostNativeRecovery.updateMany({
        where: { ...this.scope(input), status: 'PREPARED' },
        data: { status: 'REJECTED' },
      });
      await this.prisma.telegramManagedPostNativeRecovery.updateMany({
        where: { ...this.scope(input), status: 'STARTED' },
        data: { status: 'UNKNOWN' },
      });
    } catch {
      throw new Error(
        'Native recovery failure evidence could not be persisted; reconcile before retrying.',
      );
    }
  }

  private scope(input: NativeRecoveryIdentity) {
    return {
      postId: input.postId,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      owner: input.owner,
    };
  }
  private livePost(input: NativeRecoveryIdentity, now: Date) {
    return {
      ...ordinaryScheduledPostWhere(input.workspaceId, input.channelId),
      id: input.postId,
      deliveryClaimOwner: input.owner,
      deliveryClaimExpiresAt: { gt: now },
    };
  }
  private validateIds(ids: string[], emptyAllowed: boolean) {
    if (
      !Array.isArray(ids) ||
      ids.length > 100 ||
      (!emptyAllowed && !ids.length) ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== 'string' || !/^\d{1,24}$/.test(id))
    )
      throw conflict();
  }
}

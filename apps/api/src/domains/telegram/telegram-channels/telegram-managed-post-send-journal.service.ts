import { Injectable } from '@nestjs/common';
import { TelegramSourceType } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertManagedPostDeliveryActive } from './telegram-managed-post-delivery-context';

export type ManagedPostSendInput = {
  postId: string;
  workspaceId: string;
  channelId: string;
  sourceType: TelegramSourceType;
  sourceId: string;
  ordinal: number;
  payloadHash: string;
};

type Rejection = {
  confirmedRejection?: boolean;
  explicitRejected?: boolean;
  errorCode?: number;
  retryAfterSeconds?: number;
};

export class AmbiguousManagedPostSendError extends Error {
  constructor(readonly operationId: string) {
    super('Telegram send outcome is unknown; reconcile before retrying.');
  }
}

export class DeferredManagedPostSendError extends Error {
  constructor(
    readonly operationId: string,
    readonly retryAt: Date | null,
  ) {
    super(
      retryAt
        ? 'Telegram send retry is not due.'
        : 'Telegram rejected this operation permanently.',
    );
  }
}

/** Hash only the request payload; credentials must never enter the journal. */
export function managedPostSendPayloadHash(payload: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      if (value instanceof Date) return value.toISOString();
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, stable(item)]),
      );
    }
    return value;
  };
  return createHash('sha256')
    .update(JSON.stringify(stable(payload)))
    .digest('hex');
}

@Injectable()
export class TelegramManagedPostSendJournalService {
  constructor(private readonly prisma: PrismaService) {}

  forPost(input: Omit<ManagedPostSendInput, 'ordinal' | 'payloadHash'>) {
    return <T>(
      ordinal: number,
      payload: unknown,
      call: () => Promise<T>,
      extract: (result: T) => string[],
    ) =>
      this.runOperation(
        { ...input, ordinal, payloadHash: managedPostSendPayloadHash(payload) },
        call,
        extract,
      );
  }

  async begin(input: ManagedPostSendInput) {
    if (
      !Number.isInteger(input.ordinal) ||
      input.ordinal < 0 ||
      !/^[a-f0-9]{64}$/.test(input.payloadHash)
    ) {
      throw new Error('Invalid Telegram send operation identity');
    }
    await assertManagedPostDeliveryActive(this.prisma, input.postId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: {
        id: input.postId,
        workspaceId: input.workspaceId,
        telegramChannelId: input.channelId,
      },
      select: { id: true },
    });
    if (!post) throw new Error('Telegram send operation workspace mismatch');
    await this.prisma.telegramManagedPostSendOperation.createMany({
      data: [{ ...input }],
      skipDuplicates: true,
    });
    const row =
      await this.prisma.telegramManagedPostSendOperation.findUniqueOrThrow({
        where: {
          postId_ordinal: { postId: input.postId, ordinal: input.ordinal },
        },
      });
    if (
      row.payloadHash !== input.payloadHash ||
      row.workspaceId !== input.workspaceId ||
      row.channelId !== input.channelId ||
      row.sourceType !== input.sourceType ||
      row.sourceId !== input.sourceId
    ) {
      throw new AmbiguousManagedPostSendError(row.id);
    }
    if (row.status === 'ACKED')
      return { key: row.id, acknowledged: true, messageIds: row.messageIds };
    if (row.status === 'BLOCKED')
      throw new DeferredManagedPostSendError(row.id, null);
    const now = new Date();
    if (row.status === 'REJECTED' && row.retryAt && row.retryAt > now)
      throw new DeferredManagedPostSendError(row.id, row.retryAt);
    const claimed =
      await this.prisma.telegramManagedPostSendOperation.updateMany({
        where: {
          id: row.id,
          status: { in: ['READY', 'REJECTED'] },
          OR: [{ retryAt: null }, { retryAt: { lte: now } }],
        },
        data: {
          status: 'STARTED',
          startedAt: now,
          retryAt: null,
          errorCode: null,
          attemptCount: { increment: 1 },
        },
      });
    if (claimed.count !== 1) throw new AmbiguousManagedPostSendError(row.id);
    return { key: row.id, acknowledged: false, messageIds: [] as string[] };
  }

  async confirmed(key: string, messageIds: string[]) {
    if (!messageIds.length || messageIds.some((id) => !/^\d+$/.test(id)))
      throw new Error('Invalid Telegram acknowledgement');
    const result =
      await this.prisma.telegramManagedPostSendOperation.updateMany({
        where: { id: key, status: 'STARTED' },
        data: {
          status: 'ACKED',
          messageIds,
          confirmedAt: new Date(),
          retryAt: null,
          errorCode: null,
        },
      });
    if (result.count !== 1) throw new AmbiguousManagedPostSendError(key);
  }

  async rejected(key: string, error: Rejection) {
    const retryable = error.errorCode === 429;
    const seconds = Number.isFinite(error.retryAfterSeconds)
      ? Math.max(1, Math.min(error.retryAfterSeconds!, 86400))
      : 30;
    await this.prisma.telegramManagedPostSendOperation.updateMany({
      where: { id: key, status: 'STARTED' },
      data: {
        status: retryable ? 'REJECTED' : 'BLOCKED',
        errorCode: error.errorCode ?? null,
        retryAt: retryable ? new Date(Date.now() + seconds * 1000) : null,
      },
    });
  }

  async unknown(key: string) {
    await this.prisma.telegramManagedPostSendOperation.updateMany({
      where: { id: key, status: 'STARTED' },
      data: { status: 'UNKNOWN', retryAt: null },
    });
  }

  async summarise(postId: string, workspaceId: string, channelId: string) {
    const rows = await this.prisma.telegramManagedPostSendOperation.findMany({
      where: { postId, workspaceId, channelId },
      orderBy: { ordinal: 'asc' },
      select: { status: true, retryAt: true },
    });
    if (
      rows.some((row) => row.status === 'UNKNOWN' || row.status === 'STARTED')
    )
      return { state: 'UNKNOWN' as const, retryAt: null };
    if (rows.some((row) => row.status === 'BLOCKED'))
      return { state: 'BLOCKED' as const, retryAt: null };
    const retryAt = rows
      .filter((row) => row.status === 'REJECTED' && row.retryAt)
      .map((row) => row.retryAt!)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (retryAt) return { state: 'RETRY' as const, retryAt };
    return {
      state:
        rows.length && rows.every((row) => row.status === 'ACKED')
          ? ('ACKED' as const)
          : ('READY' as const),
      retryAt: null,
    };
  }

  async runOperation<T>(
    input: ManagedPostSendInput,
    call: () => Promise<T>,
    extract: (result: T) => string[],
  ) {
    const attempt = await this.begin(input);
    if (attempt.acknowledged) return attempt.messageIds;
    // A failed fence before invoking the transport is a definite non-send.
    try {
      await assertManagedPostDeliveryActive(this.prisma, input.postId);
    } catch (error) {
      await this.prisma.telegramManagedPostSendOperation.updateMany({
        where: { id: attempt.key, status: 'STARTED' },
        data: { status: 'REJECTED', retryAt: new Date(Date.now() + 30_000) },
      });
      throw error;
    }
    try {
      const ids = extract(await call());
      await this.confirmed(attempt.key, ids);
      return ids;
    } catch (error) {
      const rejection = error as Rejection | null;
      if (
        (rejection?.confirmedRejection || rejection?.explicitRejected) &&
        rejection.errorCode &&
        rejection.errorCode >= 400 &&
        rejection.errorCode < 500
      ) {
        await this.rejected(attempt.key, rejection);
      } else {
        await this.unknown(attempt.key);
      }
      throw error;
    }
  }
}

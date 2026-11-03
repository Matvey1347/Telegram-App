import { getTelegramFloodWaitSeconds } from './telegram-session-errors';
import { TelegramLeadReadLimiter } from './telegram-lead-read-limiter';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Api, TelegramClient } from 'telegram';
import { returnBigInt } from 'telegram/Helpers';
import type {
  TelegramLeadChannel,
  TelegramLeadChannelHandle,
} from './telegram-lead-channel.types';
import {
  parseTelegramLeadPost,
  normalizeTelegramLeadRaw,
} from './telegram-lead-channel-normalizer';
import { telegramLongString } from './telegram-crm-mtproto.normalizer';
import { parseTelegramInviteReference } from '../imports/telegram-import.helpers';
import { readLeadPilotMedia } from './telegram-lead-pilot-media';

type DialogCursor = {
  at: number;
  offsetId: number;
  offsetDate: number;
  offsetPeer: Api.TypeInputPeer;
};
/** Read capabilities on the already-owned client. Never connects or joins. */
export class TelegramLeadChannelReader implements TelegramLeadChannelHandle {
  private readonly limiter = new TelegramLeadReadLimiter();
  private readonly peers = new Map<string, Api.InputPeerChannel>();
  private warmup?: Promise<void>;
  private readonly cursors = new Map<string, DialogCursor>();
  constructor(private readonly client: TelegramClient) {}

  list(input: { cursor?: string; limit?: number }) {
    return this.limiter.run(() => this.readList(input));
  }
  publicProfile(username: string) {
    return this.limiter.run(async () => {
      if (!/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username))
        throw new BadRequestException('LEAD_CHANNEL_REFERENCE_INVALID');
      const entity = await this.client.getEntity(username);
      if (
        !(entity instanceof Api.Channel) ||
        !entity.broadcast ||
        entity.megagroup ||
        entity.min ||
        entity.noforwards ||
        entity.username?.toLowerCase() !== username.toLowerCase()
      )
        throw new BadRequestException('LEAD_PUBLIC_PROFILE_UNAVAILABLE');
      const full = await this.client.invoke(
        new Api.channels.GetFullChannel({ channel: entity }),
      );
      if (!(full.fullChat instanceof Api.ChannelFull))
        throw new BadRequestException('LEAD_PUBLIC_PROFILE_UNAVAILABLE');
      let pinned: { id: number; text: string } | undefined;
      if (full.fullChat.pinnedMsgId) {
        try {
          const messages = await this.client.getMessages(entity, {
            ids: [full.fullChat.pinnedMsgId],
          });
          const message = messages[0];
          if (
            message instanceof Api.Message &&
            !message.noforwards &&
            message.message
          )
            pinned = { id: message.id, text: message.message.slice(0, 4096) };
        } catch {
          // A missing or inaccessible pin does not invalidate the description.
        }
      }
      return {
        channelId: telegramLongString(entity.id),
        username: entity.username,
        about: (full.fullChat.about ?? '').slice(0, 4096),
        ...(pinned ? { pinned } : {}),
      };
    });
  }
  resolve(reference: string) {
    return this.limiter.run(async () => {
      try {
        return await this.readResolve(reference);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const safeCode = /\bINVITE_HASH_(?:EXPIRED|INVALID)\b/.test(message)
          ? 'LEAD_INVITE_INVALID'
          : /\bUSERNAME_(?:NOT_OCCUPIED|INVALID)\b/.test(message)
            ? 'LEAD_CHANNEL_NOT_FOUND'
            : /\bCHANNEL_PRIVATE\b/.test(message)
              ? 'LEAD_CHANNEL_ACCESS_DENIED'
              : getTelegramFloodWaitSeconds(error) !== null
                ? 'LEAD_TELEGRAM_RATE_LIMITED'
                : null;
        if (safeCode) throw new BadRequestException(safeCode);
        throw error;
      }
    });
  }
  history(
    channelId: string,
    input: { beforeId?: number; limit?: number; reference?: string },
  ) {
    return this.limiter.run(() => this.readHistory(channelId, input));
  }
  readPhoto(
    channelId: string,
    input: { messageId: number; maxBytes: number; reference?: string },
  ) {
    return this.limiter.run(async () => {
      const peer = await this.channel(channelId, input.reference);
      const channel = await this.client.getEntity(peer);
      if (!(channel instanceof Api.Channel))
        throw new BadRequestException('LEAD_MEDIA_CHANNEL_TYPE_INVALID');
      if (telegramLongString(channel.id) !== channelId)
        throw new BadRequestException('LEAD_MEDIA_CHANNEL_ID_MISMATCH');
      if (channel.min)
        throw new BadRequestException('LEAD_MEDIA_CHANNEL_MINIMAL');
      if (channel.noforwards)
        throw new BadRequestException('LEAD_MEDIA_CHANNEL_PROTECTED');
      if (channel.left)
        throw new BadRequestException('LEAD_MEDIA_CHANNEL_NOT_JOINED');
      if (!channel.broadcast)
        throw new BadRequestException('LEAD_MEDIA_CHANNEL_NOT_BROADCAST');
      return readLeadPilotMedia(
        this.client,
        peer,
        input.messageId,
        input.maxBytes,
      );
    });
  }
  recover(channelId: string, pts: number, reference?: string) {
    return this.limiter.run(() => this.readRecovery(channelId, pts, reference));
  }
  private async readList(input: { cursor?: string; limit?: number }) {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const cursor = input.cursor ? this.cursors.get(input.cursor) : undefined;
    if (input.cursor && (!cursor || Date.now() - cursor.at > 300_000))
      throw new BadRequestException('LEAD_CHANNEL_CURSOR_EXPIRED');
    const dialogs = await this.client.getDialogs({
      limit,
      ...(cursor
        ? {
            offsetId: cursor.offsetId,
            offsetDate: cursor.offsetDate,
            offsetPeer: cursor.offsetPeer,
          }
        : {}),
    });
    for (const dialog of dialogs)
      if (dialog.entity instanceof Api.Channel) this.remember(dialog.entity);
    const items: TelegramLeadChannel[] = dialogs.flatMap((dialog) =>
      dialog.entity instanceof Api.Channel &&
      dialog.entity.broadcast &&
      !dialog.entity.left
        ? [this.present(dialog.entity)]
        : [],
    );
    const last = dialogs.at(-1);
    const hasMore = dialogs.length >= limit && Boolean(last?.message);
    let nextCursor: string | null = null;
    if (hasMore && last?.entity && last.message) {
      nextCursor = randomUUID();
      this.cursors.set(nextCursor, {
        at: Date.now(),
        offsetId: last.message.id,
        offsetDate: last.message.date,
        offsetPeer: await this.client.getInputEntity(last.entity),
      });
      for (const [key, value] of this.cursors)
        if (Date.now() - value.at > 300_000 || this.cursors.size > 32)
          this.cursors.delete(key);
    }
    return { items, hasMore, nextCursor };
  }
  private async readResolve(reference: string) {
    const normalized = reference.trim();
    const invite = parseTelegramInviteReference(normalized);
    if (
      !invite &&
      !/^(?:@?[A-Za-z][A-Za-z0-9_]{3,31}|(?:channel:|-100)?\d{1,20})$/.test(
        normalized,
      )
    )
      throw new BadRequestException('LEAD_CHANNEL_REFERENCE_INVALID');
    const numeric = /^(?:channel:|-100)?(\d+)$/.exec(normalized);
    const checked = invite
      ? await this.client.invoke(
          new Api.messages.CheckChatInvite({ hash: invite.inviteHash }),
        )
      : null;
    if (invite && !(checked instanceof Api.ChatInviteAlready))
      throw new BadRequestException('LEAD_CHANNEL_MEMBERSHIP_REQUIRED');
    const entity =
      checked instanceof Api.ChatInviteAlready
        ? checked.chat
        : await this.client.getEntity(
            numeric
              ? new Api.PeerChannel({ channelId: returnBigInt(numeric[1]) })
              : normalized.replace(/^@/, ''),
          );
    if (
      !(entity instanceof Api.Channel) ||
      !entity.broadcast ||
      entity.megagroup
    )
      throw new BadRequestException('LEAD_BROADCAST_CHANNEL_REQUIRED');
    const full = await this.client.invoke(
      new Api.channels.GetFullChannel({ channel: entity }),
    );
    this.remember(entity);
    return {
      ...this.present(entity),
      pts: full.fullChat instanceof Api.ChannelFull ? full.fullChat.pts : null,
    };
  }
  private async readHistory(
    channelId: string,
    input: { beforeId?: number; limit?: number; reference?: string },
  ) {
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const peer = await this.channel(channelId, input.reference);
    const rows = await this.client.getMessages(peer, {
      limit,
      offsetId: input.beforeId ?? 0,
    });
    const items = rows.flatMap((row) => {
      const post = parseTelegramLeadPost(row, channelId);
      return post ? [post] : [];
    });
    const last = rows.at(-1);
    return {
      items,
      hasMore: rows.length >= limit,
      nextBeforeId: rows.length >= limit && last ? last.id : null,
    };
  }
  private async readRecovery(
    channelId: string,
    pts: number,
    reference?: string,
  ) {
    if (!Number.isSafeInteger(pts) || pts < 1)
      throw new BadRequestException('LEAD_CHANNEL_CHECKPOINT_INVALID');
    const peer = await this.channel(channelId, reference);
    const result = await this.client.invoke(
      new Api.updates.GetChannelDifference({
        channel: new Api.InputChannel({
          channelId: peer.channelId,
          accessHash: peer.accessHash,
        }),
        filter: new Api.ChannelMessagesFilterEmpty(),
        pts,
        limit: 100,
        force: true,
      }),
    );
    if (result instanceof Api.updates.ChannelDifferenceEmpty)
      return {
        posts: [],
        deletedIds: [],
        pts: result.pts,
        final: Boolean(result.final),
        tooLong: false,
      };
    if (result instanceof Api.updates.ChannelDifferenceTooLong)
      return {
        posts: [],
        deletedIds: [],
        pts:
          result.dialog instanceof Api.Dialog
            ? (result.dialog.pts ?? pts)
            : pts,
        final: false,
        tooLong: true,
      };
    const posts = new Map(
      result.newMessages.flatMap((row) => {
        const post = parseTelegramLeadPost(row, channelId);
        return post ? [[post.messageId, post] as const] : [];
      }),
    );
    const deletes = new Set<number>();
    let gap = false;
    for (const raw of result.otherUpdates)
      for (const update of normalizeTelegramLeadRaw(raw)) {
        if (update.type === 'channel.gap') {
          if (!update.channelId || update.channelId === channelId) gap = true;
        } else if (
          update.type === 'post.deleted' &&
          update.channelId === channelId
        ) {
          for (const id of update.messageIds) {
            deletes.add(id);
            posts.delete(id);
          }
        } else if (
          (update.type === 'post.new' || update.type === 'post.edited') &&
          update.post.channelId === channelId
        ) {
          deletes.delete(update.post.messageId);
          posts.set(update.post.messageId, update.post);
        }
      }
    return {
      posts: [...posts.values()].slice(0, 100),
      deletedIds: [...deletes].slice(0, 1000),
      pts: result.pts,
      final: Boolean(result.final),
      tooLong: gap || posts.size > 100 || deletes.size > 1000,
    };
  }

  onEvent(handler: Parameters<TelegramLeadChannelHandle['onEvent']>[0]) {
    const listener = (raw: unknown) => {
      for (const event of normalizeTelegramLeadRaw(raw)) handler(event);
    };
    this.client.addEventHandler(listener);
    return () => this.client.removeEventHandler(listener, undefined as never);
  }
  private present(entity: Api.Channel): TelegramLeadChannel {
    const username = entity.username ?? null;
    return {
      channelId: telegramLongString(entity.id),
      username,
      title: entity.title,
      url: username ? `https://t.me/${username}` : null,
      pts: null,
      subscribed: !entity.left && !entity.min,
    };
  }
  private remember(entity: Api.Channel) {
    if (!entity.broadcast || entity.accessHash === undefined) return;
    const id = telegramLongString(entity.id);
    this.cachePeer(
      id,
      new Api.InputPeerChannel({
        channelId: entity.id,
        accessHash: entity.accessHash,
      }),
    );
  }
  private cachePeer(id: string, peer: Api.InputPeerChannel) {
    this.peers.set(id, peer);
    while (this.peers.size > 1000) {
      const oldest = [...this.peers.keys()][0];
      if (oldest) this.peers.delete(oldest);
    }
  }
  private async channel(channelId: string, reference?: string) {
    if (!/^\d{1,20}$/.test(channelId))
      throw new BadRequestException('LEAD_CHANNEL_ID_INVALID');
    const known = this.peers.get(channelId);
    if (known) return known;
    try {
      const peer = await this.client.getInputEntity(
        new Api.PeerChannel({ channelId: returnBigInt(channelId) }),
      );
      if (peer instanceof Api.InputPeerChannel) {
        this.cachePeer(channelId, peer);
        return peer;
      }
    } catch {
      /* StringSession does not retain entity access hashes across restarts. */
    }
    if (reference && /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/.test(reference)) {
      const entity = await this.client.getEntity(reference);
      if (
        !(entity instanceof Api.Channel) ||
        !entity.broadcast ||
        telegramLongString(entity.id) !== channelId
      )
        throw new BadRequestException('LEAD_SOURCE_IDENTITY_CHANGED');
      this.remember(entity);
    } else {
      this.warmup ??= this.client.getDialogs({ limit: 100 }).then((dialogs) => {
        for (const dialog of dialogs)
          if (dialog.entity instanceof Api.Channel)
            this.remember(dialog.entity);
      });
      await this.warmup;
    }
    const peer = this.peers.get(channelId);
    if (!peer) throw new BadRequestException('LEAD_CHANNEL_ACCESS_UNAVAILABLE');
    return peer;
  }
}

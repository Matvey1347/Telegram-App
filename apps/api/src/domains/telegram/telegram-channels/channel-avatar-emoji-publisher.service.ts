import type { ChannelAvatarEmojiAsset } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ChannelAvatarEmojiApi,
  AvatarEmojiApiError,
  type AvatarEmojiSticker,
} from '@api/telegram/shared/emoji/channel-avatar-emoji-api';

import { channelAvatarEmojiImagesMatch } from './channel-avatar-emoji-image';

/** Global serialized pack writer. No transaction spans a Telegram request. */
@Injectable()
export class ChannelAvatarEmojiPublisherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ChannelAvatarEmojiApi,
  ) {}

  private async confirmedAsset(asset: ChannelAvatarEmojiAsset) {
    const pack =
      asset.packId == null
        ? null
        : await this.prisma.channelAvatarEmojiPack.findUnique({
            where: { id: asset.packId },
          });
    if (!pack || !this.api.ownsPack(pack.shortName))
      throw new AvatarEmojiApiError(
        'Avatar asset belongs to a different Telegram bot.',
      );
    return { ...asset, createdDocument: false };
  }

  private async reconcilePending(
    asset: ChannelAvatarEmojiAsset,
    stickers: AvatarEmojiSticker[],
    png: Buffer,
    assertLease: () => Promise<void>,
  ) {
    const before = new Set(asset.pendingDocumentIds);
    const candidates = stickers.filter(
      (sticker) => !before.has(sticker.customEmojiId),
    );
    for (const candidate of candidates.slice(0, 200)) {
      await assertLease();
      const bytes = await this.api.downloadSticker(candidate.fileId);
      if (await channelAvatarEmojiImagesMatch(png, bytes)) return candidate;
    }
    throw new AvatarEmojiApiError(
      'Telegram avatar mutation is still unconfirmed. Only reconciliation is allowed; no duplicate send was attempted.',
      60,
    );
  }

  private async reconcileOtherPending(
    asset: ChannelAvatarEmojiAsset,
    assertLease: () => Promise<void>,
  ) {
    const pack =
      asset.packId == null
        ? null
        : await this.prisma.channelAvatarEmojiPack.findUnique({
            where: { id: asset.packId },
          });
    if (!pack || !this.api.ownsPack(pack.shortName))
      throw new AvatarEmojiApiError(
        'Another bot has an unresolved avatar mutation. Reconciliation is required.',
        60,
      );
    const encoded = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      asset.imageUrl,
    )?.[1];
    if (!encoded || encoded.length > 133_336)
      throw new AvatarEmojiApiError(
        'Pending avatar image is unavailable for safe reconciliation.',
        60,
      );
    const png = Buffer.from(encoded, 'base64');
    if (
      png.length > 100_000 ||
      this.api.assetKey(createHash('sha256').update(png).digest('hex')) !==
        asset.hash
    )
      throw new AvatarEmojiApiError(
        'Pending avatar image identity does not match the selected System Bot.',
        60,
      );
    await assertLease();
    const stickers = await this.api.getPack(pack.shortName);
    const match = await this.reconcilePending(
      asset,
      stickers,
      png,
      assertLease,
    );
    // This repairs only the immutable asset. Its original channel may have been
    // deleted or changed photo, so never rebind any channel during reconciliation.
    await this.confirmDocument(asset.hash, pack.id, match);
  }

  private confirmDocument(
    hash: string,
    packId: number,
    match: AvatarEmojiSticker,
  ) {
    return this.prisma.channelAvatarEmojiAsset.update({
      where: { hash },
      data: {
        packId,
        fileId: match.fileId,
        fileUniqueId: match.fileUniqueId,
        customEmojiId: match.customEmojiId,
        remotePending: false,
        pendingDocumentIds: [],
      },
    });
  }

  async publish(image: { hash: string; png: Buffer; imageUrl: string }) {
    const assetHash = this.api.assetKey(image.hash);
    const saved = await this.prisma.channelAvatarEmojiAsset.findUnique({
      where: { hash: assetHash },
    });
    if (saved?.customEmojiId) return this.confirmedAsset(saved);
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.channelAvatarEmojiPublisher.updateMany({
      where: {
        id: 'global',
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
          { OR: [{ retryAt: null }, { retryAt: { lte: now } }] },
        ],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + 300_000),
      },
    });
    if (!claimed.count)
      throw new AvatarEmojiApiError(
        'Avatar emoji publisher is busy. Retry later.',
        60,
      );
    // Metadata requests are bounded; uncertain outcomes only read candidate images.
    // Stop before starting more work
    // if time was consumed by a stalled database or process suspension.
    const assertLease = async () => {
      const lease = await this.prisma.channelAvatarEmojiPublisher.findFirst({
        where: {
          id: 'global',
          leaseToken: token,
          leaseUntil: { gt: new Date(Date.now() + 30_000) },
        },
        select: { id: true },
      });
      if (!lease)
        throw new AvatarEmojiApiError(
          'Avatar emoji publisher lease expired.',
          60,
        );
    };
    try {
      const unresolved = await this.prisma.channelAvatarEmojiAsset.findFirst({
        where: { remotePending: true, hash: { not: assetHash } },
        orderBy: { createdAt: 'asc' },
      });
      if (unresolved) await this.reconcileOtherPending(unresolved, assertLease);
      let asset = await this.prisma.channelAvatarEmojiAsset.upsert({
        where: { hash: assetHash },
        create: { hash: assetHash, imageUrl: image.imageUrl },
        update: {},
      });
      if (asset.customEmojiId) return this.confirmedAsset(asset);
      if (!asset.fileId) {
        await assertLease();
        const file = await this.api.upload(image.png);
        asset = await this.prisma.channelAvatarEmojiAsset.update({
          where: { hash: assetHash },
          data: { fileId: file.fileId, fileUniqueId: file.fileUniqueId },
        });
      }
      let pack =
        asset.packId == null
          ? await this.prisma.channelAvatarEmojiPack.findFirst({
              where: {
                shortName: {
                  endsWith: this.api.packSuffix(),
                  mode: 'insensitive',
                },
              },
              orderBy: { id: 'desc' },
            })
          : await this.prisma.channelAvatarEmojiPack.findUnique({
              where: { id: asset.packId },
            });
      if (!pack) {
        const latest = await this.prisma.channelAvatarEmojiPack.findFirst({
          orderBy: { id: 'desc' },
        });
        const id = (latest?.id ?? 0) + 1;
        pack = await this.prisma.channelAvatarEmojiPack.create({
          data: { id, shortName: this.api.packName(id) },
        });
      }
      if (!this.api.ownsPack(pack.shortName))
        throw new AvatarEmojiApiError(
          'Avatar asset belongs to a different Telegram bot.',
        );
      await assertLease();
      let stickers = await this.api.getPack(pack.shortName);
      let match: AvatarEmojiSticker | undefined;
      let createdDocument = false;
      if (asset.remotePending) {
        // A lost response never causes a second create/add. The installed
        // document gets a NEW Telegram identity, so compare new documents' pixels.
        match = await this.reconcilePending(
          asset,
          stickers,
          image.png,
          assertLease,
        );
      } else {
        if (stickers.length >= 200) {
          const latest = await this.prisma.channelAvatarEmojiPack.findFirst({
            orderBy: { id: 'desc' },
          });
          const id = Math.max(pack.id, latest?.id ?? 0) + 1;
          pack = await this.prisma.channelAvatarEmojiPack.upsert({
            where: { id },
            create: { id, shortName: this.api.packName(id) },
            update: {},
          });
          await assertLease();
          stickers = await this.api.getPack(pack.shortName);
        }
        if (stickers.length >= 200)
          throw new AvatarEmojiApiError(
            'Avatar emoji pack is full. Retry later.',
            60,
          );
        asset = await this.prisma.channelAvatarEmojiAsset.update({
          where: { hash: assetHash },
          data: {
            packId: pack.id,
            pendingDocumentIds: stickers.map(
              (sticker) => sticker.customEmojiId,
            ),
            remotePending: true,
          },
        });
        let mutationStarted = false;
        try {
          await assertLease();
          mutationStarted = true;
          if (stickers.length)
            await this.api.addToPack(pack.shortName, asset.fileId!);
          else await this.api.createPack(pack.shortName, asset.fileId!);
        } catch (error) {
          // Only an explicit rejection proves no document was created. Timeouts
          // leave the snapshot intact and block subsequent writers until checked.
          if (
            !mutationStarted ||
            (error instanceof AvatarEmojiApiError &&
              error.explicitRejected &&
              error.errorCode != null &&
              error.errorCode < 500)
          ) {
            await this.prisma.channelAvatarEmojiAsset.update({
              where: { hash: assetHash },
              data: { remotePending: false, pendingDocumentIds: [] },
            });
          }
          throw error;
        }
        await assertLease();
        stickers = await this.api.getPack(pack.shortName);
        match = await this.reconcilePending(
          asset,
          stickers,
          image.png,
          assertLease,
        );
        createdDocument = true;
      }
      const confirmed = await this.confirmDocument(assetHash, pack.id, match);
      return { ...confirmed, createdDocument };
    } catch (error) {
      if (error instanceof AvatarEmojiApiError && error.retryAfterSeconds) {
        await this.prisma.channelAvatarEmojiPublisher.updateMany({
          where: { id: 'global', leaseToken: token },
          data: {
            retryAt: new Date(Date.now() + error.retryAfterSeconds * 1000),
          },
        });
      }
      throw error;
    } finally {
      await this.prisma.channelAvatarEmojiPublisher.updateMany({
        where: { id: 'global', leaseToken: token },
        data: { leaseToken: null, leaseUntil: null },
      });
    }
  }
}

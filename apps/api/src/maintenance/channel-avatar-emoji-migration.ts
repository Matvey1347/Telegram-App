import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelAvatarEmojiApi } from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { parseTelegramCustomEmojiTokens } from '@api/telegram/shared/markup/telegram-custom-emoji-markup';
import { ChannelAvatarEmojiProcessorService } from '../domains/telegram/telegram-channels/channel-avatar-emoji-processor.service';
import type { AvatarEmojiMaintenanceOptions } from '../config/channel-avatar-emoji-maintenance';
import {
  avatarEmojiInventory,
  type AvatarEmojiInventoryRow,
} from './channel-avatar-emoji-inventory';

export function avatarEmojiMigrationAction(
  row: AvatarEmojiInventoryRow,
  api: ChannelAvatarEmojiApi,
  mode: 'migrate' | 'backfill',
) {
  if (!row.owned) return 'SKIP_NOT_OWNED';
  const prefix = `channel-avatar:${api.assetKey('')}`;
  if (
    row.avatarEmojiIconId &&
    row.generatedIconName?.startsWith(prefix) &&
    row.avatarEmojiStatus === 'READY'
  )
    return 'SKIP_CURRENT';
  if (mode === 'migrate')
    return row.avatarEmojiIconId && row.generatedIconSource
      ? 'MIGRATE'
      : 'SKIP_NO_LEGACY_BINDING';
  return row.avatarEmojiStatus === 'NO_AVATAR' && !row.hasStoredAvatar
    ? 'SKIP_NO_AVATAR'
    : 'BACKFILL';
}

export async function runAvatarEmojiMigration(
  prisma: PrismaService,
  api: ChannelAvatarEmojiApi,
  processor: ChannelAvatarEmojiProcessorService | null,
  options: AvatarEmojiMaintenanceOptions,
) {
  if (options.mode === 'smoke') throw new Error('Use the LOCAL smoke runner.');
  const inventory = await avatarEmojiInventory(
    prisma,
    options.workspaceId,
    options.limit,
    options.after,
  );
  if (options.execute && !inventory.schemaReady)
    throw new Error('Deploy the tracked avatar schema migration first.');
  const results: Array<Record<string, unknown>> = [];
  const counts = {
    considered: inventory.rows.length,
    owned: 0,
    ownedWithStoredAvatar: 0,
    ownedWithoutStoredAvatar: 0,
    processed: 0,
    createdEmoji: 0,
    reusedEmoji: 0,
    skipped: 0,
    errors: 0,
  };
  for (const row of inventory.rows) {
    if (row.owned) {
      counts.owned++;
      if (row.hasStoredAvatar) counts.ownedWithStoredAvatar++;
      else counts.ownedWithoutStoredAvatar++;
    }
    const action = avatarEmojiMigrationAction(row, api, options.mode);
    const result: Record<string, unknown> = {
      channelId: row.id,
      title: row.title,
      owned: row.owned,
      storedAvatar: row.hasStoredAvatar,
      manualSelection: row.avatarEmojiManual,
      action,
    };
    if (action.startsWith('SKIP_')) counts.skipped++;
    else if (options.execute) {
      if (!processor) throw new Error('Maintenance processor unavailable.');
      try {
        let preparedImage:
          | { hash: string; png: Buffer; imageUrl: string }
          | undefined;
        if (action === 'MIGRATE') {
          const documentId = parseTelegramCustomEmojiTokens(
            row.generatedIconSource!,
          )[0]?.documentId;
          const asset = documentId
            ? await prisma.channelAvatarEmojiAsset.findUnique({
                where: { customEmojiId: documentId },
                select: { imageUrl: true },
              })
            : null;
          if (
            !asset ||
            !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(asset.imageUrl)
          )
            throw new Error('Legacy avatar bytes unavailable.');
          const png = Buffer.from(asset.imageUrl.split(',')[1], 'base64');
          if (png.length > 100_000)
            throw new Error('Legacy avatar exceeds bounded image size.');
          preparedImage = {
            hash: createHash('sha256').update(png).digest('hex'),
            png,
            imageUrl: asset.imageUrl,
          };
        }
        const outcome = await processor.process(options.workspaceId, row.id, {
          admit: true,
          scheduleRetry: false,
          preparedImage,
        });
        Object.assign(result, {
          status: outcome.status,
          documentId: outcome.customEmojiId ?? null,
          packId: outcome.packId ?? null,
          createdDocument: outcome.createdDocument ?? false,
        });
        const current = await prisma.telegramChannel.findFirst({
          where: { id: row.id, workspaceId: options.workspaceId },
          select: {
            avatarEmojiStatus: true,
            avatarEmojiManual: true,
            avatarEmojiIconId: true,
            presentationIconId: true,
            avatarEmojiIcon: { select: { emoji: true } },
          },
        });
        const documentId =
          parseTelegramCustomEmojiTokens(
            current?.avatarEmojiIcon?.emoji ?? '',
          )[0]?.documentId ?? null;
        const verified =
          current?.avatarEmojiStatus === 'READY' &&
          !!current.avatarEmojiIconId &&
          !!documentId &&
          (!outcome.customEmojiId || documentId === outcome.customEmojiId) &&
          (current.avatarEmojiManual ||
            current.presentationIconId === current.avatarEmojiIconId);
        Object.assign(result, {
          databaseStatus: current?.avatarEmojiStatus,
          selectedIconId: current?.presentationIconId,
          avatarIconId: current?.avatarEmojiIconId,
          manualSelection: current?.avatarEmojiManual,
          documentId,
          databaseVerified: verified,
        });
        if (outcome.status === 'READY' && verified) {
          counts.processed++;
          if (outcome.createdDocument) counts.createdEmoji++;
          else counts.reusedEmoji++;
        } else if (
          outcome.status === 'NOT_OWNED' ||
          (outcome.status === 'NO_AVATAR' &&
            current?.avatarEmojiStatus === 'NO_AVATAR')
        )
          counts.skipped++;
        else {
          counts.errors++;
          result.status = 'ERROR';
        }
      } catch {
        counts.errors++;
        result.status = 'ERROR';
        result.error =
          'Migration failed. Inspect channel status and retry; credentials and remote errors are not printed.';
      }
    }
    results.push(result);
  }
  const packs =
    inventory.schemaReady && options.execute
      ? await prisma.channelAvatarEmojiPack.findMany({
          select: { id: true, shortName: true },
          orderBy: { id: 'asc' },
        })
      : inventory.packs;
  const before = new Set(inventory.packs.map((pack) => pack.id));
  return {
    pagination: {
      totalChannels: inventory.totalChannels,
      remainingChannels: inventory.remainingChannels,
      limit: options.limit,
      nextCursor: inventory.nextCursor,
      truncated: !!inventory.nextCursor,
    },
    mode: options.mode,
    dryRun: !options.execute,
    target: options.production ? 'PRODUCTION' : 'LOCAL',
    workspace: inventory.workspace,
    schemaReady: inventory.schemaReady,
    counts,
    packs,
    createdPacks: packs.filter((pack) => !before.has(pack.id)),
    results,
    avatarEvidence:
      'Stored photos only in dry-run; normal backfill verifies actual Telegram photo on the production host.',
  };
}

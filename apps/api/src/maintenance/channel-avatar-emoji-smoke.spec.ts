import { createHash } from 'crypto';
import sharp from 'sharp';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '@api/telegram/shared/bot/telegram-bot-api.client';
import type {
  AvatarEmojiSticker,
  ChannelAvatarEmojiApi,
} from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import type { TelegramSystemBotConfigService } from '../domains/telegram/telegram-system-bot/telegram-system-bot-config.service';
import type {
  ChannelAvatarEmojiProcessorService,
  ChannelAvatarEmojiProcessOptions,
} from '../domains/telegram/telegram-channels/channel-avatar-emoji-processor.service';
import type { AvatarEmojiMaintenanceOptions } from '../config/channel-avatar-emoji-maintenance';
import { runAvatarEmojiSmoke } from './channel-avatar-emoji-smoke';

type Channel = {
  id: string;
  workspaceId: string;
  role: 'OWNER' | 'ADMIN';
  photoUrl: string | null;
  manual: boolean;
  selected: string | null;
  avatarIconId: string | null;
  emoji: string | null;
};
type FixtureOptions = {
  stripEntity?: boolean;
  bindingMismatch?: boolean;
  repeatedCreates?: boolean;
  squareDownload?: boolean;
};
const workspaceId = 'workspace-local';
const options = (
  execute: boolean,
  production = false,
): AvatarEmojiMaintenanceOptions => ({
  workspaceId,
  mode: 'smoke',
  limit: 100,
  execute,
  production,
});

async function fixture(flags: FixtureOptions = {}) {
  const image = (background: string) =>
    sharp({ create: { width: 160, height: 120, channels: 3, background } })
      .png()
      .toBuffer();
  const [first, second] = await Promise.all([
    image('#247864'),
    image('#893257'),
  ]);
  const square = flags.squareDownload
    ? await sharp(first).resize(100, 100).png().toBuffer()
    : null;
  const row = (id: string, bytes: Buffer): Channel => ({
    id,
    workspaceId,
    role: 'OWNER',
    photoUrl: `data:image/png;base64,${bytes.toString('base64')}`,
    manual: false,
    selected: null,
    avatarIconId: null,
    emoji: null,
  });
  const channels = [
    row('owner-one', first),
    { ...row('owner-two', second), manual: true, selected: 'user-selected' },
    { ...row('admin-only', first), role: 'ADMIN' as const },
    { ...row('foreign-owner', first), workspaceId: 'another-workspace' },
  ];
  const uploaded = new Map<string, Buffer>();
  const remote = new Map<string, AvatarEmojiSticker[]>();
  const write = jest.fn(() => {
    throw new Error('Unexpected direct mutation');
  });
  const findMany = jest.fn(
    (query: {
      where: {
        workspaceId: string;
        sourceAccesses: {
          some: { workspaceId?: string; sourceType: string; role: string };
        };
      };
    }) =>
      Promise.resolve(
        channels
          .filter(
            (channel) =>
              channel.workspaceId === query.where.workspaceId &&
              channel.role === query.where.sourceAccesses.some.role &&
              query.where.sourceAccesses.some.workspaceId ===
                channel.workspaceId,
          )
          .map(({ id, photoUrl }) => ({ id, photoUrl })),
      ),
  );
  const findFirst = jest.fn(
    ({ where }: { where: { id: string; workspaceId: string } }) => {
      const channel = channels.find(
        (item) =>
          item.id === where.id && item.workspaceId === where.workspaceId,
      );
      return Promise.resolve(
        channel
          ? {
              avatarEmojiStatus: 'READY',
              avatarEmojiManual: channel.manual,
              avatarEmojiIconId: channel.avatarIconId,
              presentationIconId: channel.selected,
              avatarEmojiIcon: channel.emoji ? { emoji: channel.emoji } : null,
            }
          : null,
      );
    },
  );
  const prisma = {
    telegramChannel: { findMany, findFirst, updateMany: write },
    $executeRaw: write,
  };
  const api = {
    packName: jest.fn(
      (sequence: number) => `avatars${sequence}_by_local_system_bot`,
    ),
    upload: jest.fn((png: Buffer) => {
      const hash = createHash('sha256').update(png).digest('hex');
      uploaded.set(hash, png);
      return Promise.resolve({ fileId: hash, fileUniqueId: hash });
    }),
    getPack: jest.fn((name: string) =>
      Promise.resolve([...(remote.get(name) ?? [])]),
    ),
    createPack: jest.fn((name: string, fileId: string) => {
      remote.set(name, [
        { fileId, fileUniqueId: fileId, customEmojiId: '123' },
      ]);
      return Promise.resolve();
    }),
    addToPack: jest.fn((name: string, fileId: string) => {
      const pack = remote.get(name)!;
      pack.push({
        fileId,
        fileUniqueId: fileId,
        customEmojiId: String(123 + pack.length),
      });
      return Promise.resolve();
    }),
  };
  const bot = {
    getChat: jest.fn(() => Promise.resolve({})),
    call: jest.fn(
      (_token: string, method: string, body: Record<string, unknown>) => {
        if (method === 'getWebhookInfo')
          return Promise.resolve({
            url: 'https://local.example/webhook',
            allowed_updates: ['message', 'callback_query'],
          });
        if (method === 'getMyCommands')
          return Promise.resolve([{ command: 'start', description: 'Start' }]);
        if (method === 'getCustomEmojiStickers') {
          const ids = Array.isArray(body.custom_emoji_ids)
            ? body.custom_emoji_ids
            : [];
          return Promise.resolve(
            [...remote.values()]
              .flat()
              .filter((sticker) => ids.includes(sticker.customEmojiId))
              .map((sticker) => ({
                custom_emoji_id: sticker.customEmojiId,
                width: 100,
                height: 100,
                file_id: sticker.fileId,
              })),
          );
        }
        if (method === 'sendMessage') {
          const text = typeof body.text === 'string' ? body.text : '';
          const documentId = /emoji-id="(\d+)"/.exec(text)?.[1];
          return Promise.resolve({
            message_id: 99,
            entities: flags.stripEntity
              ? []
              : [{ type: 'custom_emoji', custom_emoji_id: documentId }],
          });
        }
        return Promise.reject(new Error('Unexpected Telegram method'));
      },
    ),
    getFile: jest.fn((_token: string, fileId: string) =>
      Promise.resolve({ file_path: fileId }),
    ),
    downloadFile: jest.fn((_token: string, path: string, _limit: number) => {
      void _limit;
      return Promise.resolve({
        bytes: square ?? uploaded.get(path)!,
      });
    }),
  };
  const processed = new Map<string, AvatarEmojiSticker>();
  const processor = {
    process: jest.fn(
      async (
        _workspace: string,
        id: string,
        input: ChannelAvatarEmojiProcessOptions,
      ) => {
        const channel = channels.find((item) => item.id === id)!;
        let document = processed.get(id);
        if (!document) {
          const uploadedImage = await api.upload(input.preparedImage!.png);
          const pack = api.packName(1);
          const before = await api.getPack(pack);
          if (before.length) await api.addToPack(pack, uploadedImage.fileId);
          else await api.createPack(pack, uploadedImage.fileId);
          document = (await api.getPack(pack)).find(
            (sticker) => sticker.fileUniqueId === uploadedImage.fileUniqueId,
          )!;
          processed.set(id, document);
        }
        channel.avatarIconId = `generated-${id}`;
        channel.emoji = `![📣](tg://emoji?id=${document.customEmojiId}${flags.bindingMismatch ? '4' : ''})`;
        if (!channel.manual) channel.selected = channel.avatarIconId;
        return {
          status: 'READY' as const,
          customEmojiId: document.customEmojiId,
          createdDocument: flags.repeatedCreates ?? false,
          packId: 1,
        };
      },
    ),
  };
  const system = { environment: 'LOCAL', token: 'test-only-unusable-token' };
  const config = new ConfigService({
    TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID: '42',
  });
  const run = (input = options(true), withProcessor = true) =>
    runAvatarEmojiSmoke(
      prisma as unknown as PrismaService,
      api as unknown as ChannelAvatarEmojiApi,
      bot as unknown as TelegramBotApiClient,
      system as unknown as TelegramSystemBotConfigService,
      config,
      input,
      withProcessor
        ? (processor as unknown as ChannelAvatarEmojiProcessorService)
        : null,
    );
  return { api, bot, channels, prisma, processor, system, run, write };
}

describe('LOCAL owner-avatar Telegram smoke checks', () => {
  it('plans only stored workspace-owner avatars without API calls or mutations', async () => {
    const f = await fixture();
    await expect(f.run(options(false))).resolves.toEqual({
      mode: 'smoke',
      dryRun: true,
      target: 'LOCAL',
      channels: ['owner-one', 'owner-two'],
      ownerOnly: true,
    });
    expect(f.prisma.telegramChannel.findMany.mock.calls[0][0].where).toEqual({
      workspaceId,
      sourceAccesses: {
        some: { workspaceId, sourceType: 'MTPROTO', role: 'OWNER' },
      },
      photoUrl: { not: null },
    });
    expect(f.bot.call).not.toHaveBeenCalled();
    expect(f.bot.getChat).not.toHaveBeenCalled();
    expect(f.api.upload).not.toHaveBeenCalled();
    expect(f.processor.process).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
  });

  it('verifies Telegram entity, round downloaded pixels, DB binding, repeated-image reuse and unchanged bot setup', async () => {
    const f = await fixture();
    const report = await f.run();
    expect(report).toMatchObject({
      verified: true,
      webhookUnchanged: true,
      commandsUnchanged: true,
    });
    expect(report.results).toHaveLength(2);
    for (const result of report.results ?? [])
      expect(result).toMatchObject({
        documentAvailable: true,
        image100x100: true,
        transparentRoundAvatar: true,
        customEmojiEntityAccepted: true,
        databaseBindingVerified: true,
        repeatedImageReused: true,
      });
    expect(f.api.createPack).toHaveBeenCalledTimes(1);
    expect(f.api.addToPack).toHaveBeenCalledTimes(1);
    expect(f.processor.process).toHaveBeenCalledTimes(4);
    for (const [target, _id, input] of f.processor.process.mock.calls) {
      void _id;
      expect(target).toBe(workspaceId);
      expect(input).toMatchObject({ admit: true, scheduleRetry: false });
      expect(input.preparedImage?.png).toBeInstanceOf(Buffer);
    }
    expect(
      f.channels.find((channel) => channel.id === 'owner-two')?.selected,
    ).toBe('user-selected');
    expect(f.write).not.toHaveBeenCalled();
  });

  it('fails verification when Telegram strips the custom entity', async () => {
    const f = await fixture({ stripEntity: true });
    const report = await f.run();
    expect(report.verified).toBe(false);
    expect(
      report.results?.every(
        (result) => result.customEmojiEntityAccepted === false,
      ),
    ).toBe(true);
  });

  it('fails verification without a database binding or repeated-image reuse', async () => {
    const missing = await fixture();
    await expect(missing.run(options(true), false)).rejects.toThrow(
      'shared avatar processor',
    );
    const repeated = await fixture({ repeatedCreates: true });
    expect((await repeated.run()).verified).toBe(false);
  });

  it('rejects production before reading rows or calling Telegram', async () => {
    const f = await fixture();
    await expect(f.run(options(true, true))).rejects.toThrow('LOCAL');
    expect(f.prisma.telegramChannel.findMany).not.toHaveBeenCalled();
    expect(f.bot.call).not.toHaveBeenCalled();
  });

  it('turns an owner-not-started rejection into a safe actionable error before uploading', async () => {
    const f = await fixture();
    f.bot.getChat.mockRejectedValue(
      new TelegramBotApiError('Chat unavailable', 'PERMANENT', {
        explicitRejected: true,
        errorCode: 400,
      }),
    );
    await expect(f.run()).rejects.toMatchObject({
      message: 'Owner must send /start to the selected LOCAL System Bot.',
      errorCode: 400,
    });
    expect(f.api.upload).not.toHaveBeenCalled();
    expect(f.processor.process).not.toHaveBeenCalled();
  });

  it('does not mistake a document-ID prefix for the verified bound document', async () => {
    const f = await fixture({ bindingMismatch: true });
    const report = await f.run();
    expect(report.verified).toBe(false);
    expect(
      report.results?.every(
        (result) => result.databaseBindingVerified === false,
      ),
    ).toBe(true);
  });

  it('fails verification when the downloaded image has opaque square corners', async () => {
    const f = await fixture({ squareDownload: true });
    const report = await f.run();
    expect(report.verified).toBe(false);
    expect(
      report.results?.every((result) => result.image100x100 === true),
    ).toBe(true);
    expect(
      report.results?.every(
        (result) => result.transparentRoundAvatar === false,
      ),
    ).toBe(true);
  });
});

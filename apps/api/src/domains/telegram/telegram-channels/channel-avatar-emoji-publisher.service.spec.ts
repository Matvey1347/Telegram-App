/* eslint-disable @typescript-eslint/require-await -- In-memory async ports preserve the Prisma/Telegram Promise contract. */
import sharp from 'sharp';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AvatarEmojiApiError,
  ChannelAvatarEmojiApi,
  type AvatarEmojiSticker,
} from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { ChannelAvatarEmojiPublisherService } from './channel-avatar-emoji-publisher.service';

type Asset = {
  hash: string;
  imageUrl: string;
  fileId: string | null;
  fileUniqueId: string | null;
  packId: number | null;
  customEmojiId: string | null;
  pendingDocumentIds: string[];
  remotePending: boolean;
};
type Pack = { id: number; shortName: string };
type Lease = {
  leaseToken: string | null;
  leaseUntil: Date | null;
  retryAt: Date | null;
};

let imageA: Buffer;
let imageB: Buffer;
beforeAll(async () => {
  imageA = await sharp({
    create: { width: 100, height: 100, channels: 4, background: '#ff3300' },
  })
    .png()
    .toBuffer();
  imageB = await sharp({
    create: { width: 100, height: 100, channels: 4, background: '#0033ff' },
  })
    .png()
    .toBuffer();
});

function fixture() {
  const assets = new Map<string, Asset>();
  const packs = new Map<number, Pack>();
  const remote = new Map<string, AvatarEmojiSticker[]>();
  const lease: Lease = { leaseToken: null, leaseUntil: null, retryAt: null };
  const uploaded = new Map<string, string>();
  const uploadedBytes = new Map<string, Buffer>();
  const installedBytes = new Map<string, Buffer>();
  let documentSequence = 0;
  const events: string[] = [];
  const copy = <T>(value: T): T => structuredClone(value);
  const prisma = {
    channelAvatarEmojiAsset: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { hash?: { not: string }; packId?: number };
        }) => {
          const row = [...assets.values()].find(
            (asset) =>
              asset.remotePending &&
              asset.hash !== where.hash?.not &&
              (where.packId === undefined || asset.packId === where.packId),
          );
          return row ? copy(row) : null;
        },
      ),
      findUnique: jest.fn(async ({ where }: { where: { hash: string } }) =>
        copy(assets.get(where.hash) ?? null),
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
        }: {
          where: { hash: string };
          create: { hash: string; imageUrl: string };
        }) => {
          if (!assets.has(where.hash))
            assets.set(where.hash, {
              ...create,
              fileId: null,
              fileUniqueId: null,
              packId: null,
              customEmojiId: null,
              pendingDocumentIds: [],
              remotePending: false,
            });
          return copy(assets.get(where.hash)!);
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { hash: string };
          data: Partial<Asset>;
        }) => {
          const row = assets.get(where.hash);
          if (!row) throw new Error('Asset does not exist');
          Object.assign(row, data);
          if (data.packId != null)
            events.push(`intent:${where.hash}:${data.packId}`);
          return copy(row);
        },
      ),
    },
    channelAvatarEmojiPack: {
      findFirst: jest.fn(
        async (query?: { where?: { shortName: { endsWith: string } } }) =>
          copy(
            [...packs.values()]
              .filter(
                (pack) =>
                  !query?.where ||
                  pack.shortName.endsWith(query.where.shortName.endsWith),
              )
              .sort((a, b) => b.id - a.id)[0] ?? null,
          ),
      ),
      findUnique: jest.fn(async ({ where }: { where: { id: number } }) =>
        copy(packs.get(where.id) ?? null),
      ),
      create: jest.fn(async ({ data }: { data: Pack }) => {
        if (packs.has(data.id)) throw new Error('Duplicate pack');
        packs.set(data.id, copy(data));
        return copy(data);
      }),
      upsert: jest.fn(
        async ({ where, create }: { where: { id: number }; create: Pack }) => {
          if (!packs.has(where.id)) packs.set(where.id, copy(create));
          return copy(packs.get(where.id)!);
        },
      ),
    },
    channelAvatarEmojiPublisher: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { leaseToken?: string };
          data: Partial<Lease>;
        }) => {
          if (where.leaseToken !== undefined) {
            if (where.leaseToken !== lease.leaseToken) return { count: 0 };
          } else if (
            (lease.leaseUntil && lease.leaseUntil.getTime() > Date.now()) ||
            (lease.retryAt && lease.retryAt.getTime() > Date.now())
          )
            return { count: 0 };
          Object.assign(lease, data);
          return { count: 1 };
        },
      ),
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { leaseToken: string; leaseUntil: { gt: Date } };
        }) =>
          lease.leaseToken === where.leaseToken &&
          lease.leaseUntil &&
          lease.leaseUntil > where.leaseUntil.gt
            ? { id: 'global' }
            : null,
      ),
    },
  };
  const emojiFor = (fileId: string): AvatarEmojiSticker => {
    const id = ++documentSequence;
    const documentFileId = `document:${id}`;
    installedBytes.set(documentFileId, uploadedBytes.get(fileId)!);
    return {
      fileId: documentFileId,
      fileUniqueId: `installed-unique:${id}`,
      customEmojiId: String(6000000000000000n + BigInt(id)),
    };
  };
  const api = {
    assetKey: jest.fn((hash: string) => hash),
    packSuffix: jest.fn(() => '_by_servicebot'),
    ownsPack: jest.fn((name: string) => name.endsWith('_by_servicebot')),
    packName: jest.fn((id: number) => `channelavatars${id}_by_servicebot`),
    upload: jest.fn(async (png: Buffer) => {
      const fileId = `file:${png.toString('hex')}`;
      const fileUniqueId = `unique:${png.toString('hex')}`;
      uploaded.set(fileId, fileUniqueId);
      uploadedBytes.set(fileId, png);
      return { fileId, fileUniqueId };
    }),
    downloadSticker: jest.fn(
      async (fileId: string) => installedBytes.get(fileId)!,
    ),
    getPack: jest.fn(async (name: string) => copy(remote.get(name) ?? [])),
    createPack: jest.fn(async (name: string, fileId: string) => {
      events.push(`create:${name}`);
      if (remote.has(name)) throw new Error('Remote pack already exists');
      remote.set(name, [emojiFor(fileId)]);
    }),
    addToPack: jest.fn(async (name: string, fileId: string) => {
      events.push(`add:${name}`);
      const stickers = remote.get(name);
      if (!stickers || stickers.length >= 200)
        throw new Error('Remote pack unavailable or full');
      if (
        !stickers.some(
          (sticker) => sticker.fileUniqueId === uploaded.get(fileId),
        )
      )
        stickers.push(emojiFor(fileId));
    }),
  };
  const image = (label = 'content-a') => {
    const png = label === 'content-a' ? imageA : imageB;
    return {
      hash: createHash('sha256').update(png).digest('hex'),
      png,
      imageUrl: `data:image/png;base64,${png.toString('base64')}`,
    };
  };
  const seedPack = (id: number, size: number) => {
    const shortName = api.packName(id);
    packs.set(id, { id, shortName });
    remote.set(
      shortName,
      Array.from({ length: size }, (_, index) => ({
        fileId: `existing:${id}:${index}`,
        fileUniqueId: `existing-unique:${id}:${index}`,
        customEmojiId: String(7000000000000000n + BigInt(id * 200 + index)),
      })),
    );
    return shortName;
  };
  return {
    assets,
    packs,
    remote,
    lease,
    events,
    uploaded,
    installedBytes,
    prisma,
    api,
    image,
    seedPack,
    service: new ChannelAvatarEmojiPublisherService(
      prisma as unknown as PrismaService,
      api as unknown as ChannelAvatarEmojiApi,
    ),
  };
}

describe('ChannelAvatarEmojiPublisherService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('creates one immutable document and reuses a completed content hash without remote calls or writes', async () => {
    const { service, image, assets, packs, remote, api, prisma, lease } =
      fixture();
    const first = await service.publish(image());
    const writes = prisma.channelAvatarEmojiAsset.update.mock.calls.length;
    const lookups = api.getPack.mock.calls.length;
    const repeated = await service.publish(image());
    expect(repeated).toEqual({ ...first, createdDocument: false });
    expect(first.createdDocument).toBe(true);
    expect(repeated.createdDocument).toBe(false);
    expect(first.customEmojiId).toMatch(/^\d+$/);
    expect(assets.size).toBe(1);
    expect(packs.size).toBe(1);
    expect([...remote.values()].flat()).toHaveLength(1);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.createPack).toHaveBeenCalledTimes(1);
    expect(api.getPack).toHaveBeenCalledTimes(lookups);
    expect(prisma.channelAvatarEmojiAsset.update).toHaveBeenCalledTimes(writes);
    expect(lease.leaseToken).toBeNull();
  });

  it('puts distinct channel avatars in the same pack and reuses only the matching image', async () => {
    const { service, image, assets, packs, remote, api } = fixture();

    const first = await service.publish(image());
    const second = await service.publish(image('content-b'));
    const repeatedFirst = await service.publish(image());

    expect(first.packId).toBe(1);
    expect(second.packId).toBe(1);
    expect(second.customEmojiId).not.toBe(first.customEmojiId);
    expect(repeatedFirst.customEmojiId).toBe(first.customEmojiId);
    expect(assets.size).toBe(2);
    expect(packs.size).toBe(1);
    expect(remote.get(api.packName(1))).toHaveLength(2);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.createPack).toHaveBeenCalledTimes(1);
    expect(api.addToPack).toHaveBeenCalledTimes(1);
  });

  it('adds to an available pack and persists the pack/file intent before the remote mutation', async () => {
    const { service, image, seedPack, api, remote, events, assets } = fixture();
    const name = seedPack(1, 199);
    await service.publish(image());
    expect(remote.get(name)).toHaveLength(200);
    expect(api.createPack).not.toHaveBeenCalled();
    expect(events.indexOf(`intent:${image().hash}:1`)).toBeLessThan(
      events.indexOf(`add:${name}`),
    );
    expect(assets.get(image().hash)?.packId).toBe(1);
  });

  it('rolls over a full 200-emoji pack without modifying or deleting its documents', async () => {
    const { service, image, seedPack, remote, api, assets, packs } = fixture();
    const fullName = seedPack(3, 200);
    const original = structuredClone(remote.get(fullName));
    const result = await service.publish(image());
    expect(result.packId).toBe(4);
    expect(packs.get(4)?.shortName).toBe(api.packName(4));
    expect(remote.get(fullName)).toEqual(original);
    expect(remote.get(api.packName(4))).toHaveLength(1);
    expect(api.addToPack).not.toHaveBeenCalled();
    expect(assets.get(image().hash)?.customEmojiId).toBe(result.customEmojiId);
  });

  it.each(['add', 'create'] as const)(
    'reconciles a remotely accepted %s whose response was lost before attempting another mutation',
    async (mode) => {
      const { service, image, seedPack, api, remote, assets, lease } =
        fixture();
      if (mode === 'add') seedPack(1, 4);
      const mutation = mode === 'add' ? api.addToPack : api.createPack;
      const implementation = mutation.getMockImplementation()!;
      mutation.mockImplementationOnce(async (name, fileId) => {
        await implementation(name, fileId);
        throw new AvatarEmojiApiError('Remote outcome is uncertain');
      });
      await expect(service.publish(image())).rejects.toThrow('uncertain');
      expect(assets.get(image().hash)?.customEmojiId).toBeNull();
      expect(assets.get(image().hash)?.packId).toBe(1);
      expect(lease.leaseToken).toBeNull();
      const result = await service.publish(image());
      expect(result.customEmojiId).toMatch(/^\d+$/);
      expect(result.createdDocument).toBe(false);
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(api.upload).toHaveBeenCalledTimes(1);
      expect(
        [...remote.values()]
          .flat()
          .filter((item) => item.fileUniqueId === result.fileUniqueId),
      ).toHaveLength(1);
    },
  );

  it('recovers the deterministic next pack after a lost remote creation result', async () => {
    const { service, image, seedPack, api, remote, assets } = fixture();
    const fullName = seedPack(1, 200);
    const create = api.createPack.getMockImplementation()!;
    api.createPack.mockImplementationOnce(async (name, fileId) => {
      await create(name, fileId);
      throw new AvatarEmojiApiError('Creation response was lost');
    });
    await expect(service.publish(image())).rejects.toThrow('lost');
    expect(assets.get(image().hash)?.packId).toBe(2);
    const recovered = await service.publish(image());
    expect(recovered.packId).toBe(2);
    expect(remote.get(fullName)).toHaveLength(200);
    expect(remote.get(api.packName(2))).toHaveLength(1);
    expect(api.createPack).toHaveBeenCalledTimes(1);
  });

  it('rejects an active global lease before upload or asset creation', async () => {
    const { service, image, lease, api, assets } = fixture();
    lease.leaseToken = 'another-replica';
    lease.leaseUntil = new Date(Date.now() + 120_000);
    await expect(service.publish(image())).rejects.toMatchObject({
      retryAfterSeconds: 60,
    });
    expect(assets.size).toBe(0);
    expect(api.upload).not.toHaveBeenCalled();
    expect(lease.leaseToken).toBe('another-replica');
  });

  it('persists Telegram cooldown globally and resumes after its deadline', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const { service, image, api, lease, assets } = fixture();
    api.upload.mockRejectedValueOnce(
      new AvatarEmojiApiError('Rate limited', 90, true, 429),
    );
    await expect(service.publish(image())).rejects.toMatchObject({
      errorCode: 429,
    });
    expect(lease.retryAt).toEqual(new Date(Date.now() + 90_000));
    expect(lease.leaseToken).toBeNull();
    await expect(service.publish(image('content-b'))).rejects.toThrow('busy');
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(assets.has(image('content-b').hash)).toBe(false);
    jest.advanceTimersByTime(90_001);
    const result = await service.publish(image());
    expect(result.customEmojiId).toMatch(/^\d+$/);
    expect(api.upload).toHaveBeenCalledTimes(2);
  });

  it('serializes simultaneous requests across distinct publisher instances through the global lease', async () => {
    const { service, image, prisma, api, remote } = fixture();
    const replica = new ChannelAvatarEmojiPublisherService(
      prisma as unknown as PrismaService,
      api as unknown as ChannelAvatarEmojiApi,
    );
    let unblock!: () => void;
    let started!: () => void;
    const uploadStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const upload = api.upload.getMockImplementation()!;
    api.upload.mockImplementationOnce(async (png) => {
      started();
      await blocked;
      return upload(png);
    });
    const first = service.publish(image());
    await uploadStarted;
    await expect(replica.publish(image())).rejects.toThrow('busy');
    unblock();
    const completed = await first;
    await expect(replica.publish(image())).resolves.toEqual({
      ...completed,
      createdDocument: false,
    });
    expect([...remote.values()].flat()).toHaveLength(1);
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(api.createPack).toHaveBeenCalledTimes(1);
  });

  it('stops remote writes if a stalled upload consumed the safety window of the lease', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const { service, image, api, lease } = fixture();
    const upload = api.upload.getMockImplementation()!;
    api.upload.mockImplementationOnce(async (png) => {
      const result = await upload(png);
      jest.advanceTimersByTime(280_000);
      return result;
    });
    await expect(service.publish(image())).rejects.toThrow('lease expired');
    expect(api.getPack).not.toHaveBeenCalled();
    expect(api.createPack).not.toHaveBeenCalled();
    expect(api.addToPack).not.toHaveBeenCalled();
    expect(lease.leaseToken).toBeNull();
  });
  it('publishes a new namespaced asset without modifying old bot documents', async () => {
    const f = fixture();
    const old = await f.service.publish(f.image());
    const oldRow = structuredClone(f.assets.get(f.image().hash));
    f.api.assetKey.mockImplementation((hash) => `production:nextbot:${hash}`);
    f.api.packSuffix.mockReturnValue('_by_nextbot');
    f.api.ownsPack.mockImplementation((name) => name.endsWith('_by_nextbot'));
    f.api.packName.mockImplementation((id) => `channelavatars${id}_by_nextbot`);
    const current = await f.service.publish(f.image());
    expect(current.createdDocument).toBe(true);
    expect(current.hash).toBe(`production:nextbot:${f.image().hash}`);
    expect(current.packId).not.toBe(old.packId);
    expect(f.assets.get(f.image().hash)).toEqual(oldRow);
    expect(
      [...f.packs.values()].some((pack) =>
        pack.shortName.endsWith('_by_nextbot'),
      ),
    ).toBe(true);
  });

  it('never returns a cached document assigned to another bot pack', async () => {
    const f = fixture();
    const old = await f.service.publish(f.image());
    f.packs.set(old.packId!, {
      id: old.packId!,
      shortName: 'legacy_by_anotherbot',
    });
    const uploads = f.api.upload.mock.calls.length;
    await expect(f.service.publish(f.image())).rejects.toThrow(
      'different Telegram bot',
    );
    expect(f.api.upload).toHaveBeenCalledTimes(uploads);
  });
  it('persists installed document identity instead of the uploaded PNG file identity', async () => {
    const f = fixture();
    const result = await f.service.publish(f.image());
    expect(result.fileUniqueId).toBe('installed-unique:1');
    expect(result.fileId).toBe('document:1');
    expect(f.assets.get(f.image().hash)?.pendingDocumentIds).toEqual([]);
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(false);
    expect(f.api.downloadSticker).toHaveBeenCalledWith('document:1');
  });

  it('never blindly repeats an ambiguous mutation that has not appeared remotely', async () => {
    const f = fixture();
    f.api.createPack.mockRejectedValueOnce(
      new AvatarEmojiApiError('Unknown remote outcome'),
    );
    await expect(f.service.publish(f.image())).rejects.toThrow('Unknown');
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(true);
    await expect(f.service.publish(f.image())).rejects.toThrow('unconfirmed');
    expect(f.api.createPack).toHaveBeenCalledTimes(1);
    expect(f.api.addToPack).not.toHaveBeenCalled();
  });

  it('isolates an unresolved pack and publishes a different avatar without repeating the original send', async () => {
    const f = fixture();
    f.api.createPack.mockRejectedValueOnce(
      new AvatarEmojiApiError('Unknown remote outcome'),
    );
    await expect(f.service.publish(f.image())).rejects.toThrow('Unknown');
    await expect(
      f.service.publish(f.image('content-b')),
    ).resolves.toMatchObject({
      packId: 2,
      createdDocument: true,
    });
    await expect(f.service.publish(f.image())).rejects.toThrow('unconfirmed');
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(true);
    expect(f.api.createPack.mock.calls.map(([name]) => name)).toEqual([
      'channelavatars1_by_servicebot',
      'channelavatars2_by_servicebot',
    ]);
  });

  it('clears a rejected mutation snapshot so it may be retried after Telegram cooldown', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const f = fixture();
    f.api.createPack.mockRejectedValueOnce(
      new AvatarEmojiApiError('Rate limited', 45, true, 429),
    );
    await expect(f.service.publish(f.image())).rejects.toMatchObject({
      errorCode: 429,
    });
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(false);
    jest.advanceTimersByTime(45_001);
    await expect(f.service.publish(f.image())).resolves.toMatchObject({
      createdDocument: true,
    });
    expect(f.api.createPack).toHaveBeenCalledTimes(2);
  });

  it('leaves the mutation pending if more than one remote document matches', async () => {
    const f = fixture();
    const create = f.api.createPack.getMockImplementation()!;
    f.api.createPack.mockImplementationOnce(async (name, fileId) => {
      await create(name, fileId);
      const documents = f.remote.get(name)!;
      documents.push({ ...documents[0], customEmojiId: '7000000000001234' });
    });

    await expect(f.service.publish(f.image())).rejects.toThrow(
      'Multiple Telegram documents match',
    );
    expect(f.assets.get(f.image().hash)).toMatchObject({
      customEmojiId: null,
      remotePending: true,
    });
  });

  it('does not adopt an unrelated document even if it appeared after the snapshot', async () => {
    const f = fixture();
    const create = f.api.createPack.getMockImplementation()!;
    f.api.createPack.mockImplementationOnce(async (name, fileId) => {
      await create(name, fileId);
      f.installedBytes.set('document:1', imageB);
    });
    await expect(f.service.publish(f.image())).rejects.toThrow('unconfirmed');
    expect(f.assets.get(f.image().hash)?.customEmojiId).toBeNull();
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(true);
  });
  it('clears the snapshot if a stalled database consumed the lease before any send started', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const f = fixture();
    const update =
      f.prisma.channelAvatarEmojiAsset.update.getMockImplementation()!;
    let stall = true;
    f.prisma.channelAvatarEmojiAsset.update.mockImplementation(
      async (input) => {
        const result = await update(input);
        if (input.data.remotePending === true && stall) {
          stall = false;
          jest.advanceTimersByTime(280_000);
        }
        return result;
      },
    );
    await expect(f.service.publish(f.image())).rejects.toThrow('lease expired');
    expect(f.api.createPack).not.toHaveBeenCalled();
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(false);
    jest.advanceTimersByTime(60_001);
    await expect(f.service.publish(f.image())).resolves.toMatchObject({
      createdDocument: true,
    });
  });

  it('treats a server-side 5xx as uncertain even when Telegram returned an error body', async () => {
    const f = fixture();
    f.api.createPack.mockRejectedValueOnce(
      new AvatarEmojiApiError('Telegram server error', undefined, true, 500),
    );
    await expect(f.service.publish(f.image())).rejects.toThrow('server error');
    expect(f.assets.get(f.image().hash)?.remotePending).toBe(true);
    await expect(f.service.publish(f.image())).rejects.toThrow('unconfirmed');
    expect(f.api.createPack).toHaveBeenCalledTimes(1);
  });
  it('reconciles an older lost response before publishing a changed photo without resending the old one', async () => {
    const f = fixture();
    const create = f.api.createPack.getMockImplementation()!;
    f.api.createPack.mockImplementationOnce(async (name, fileId) => {
      await create(name, fileId);
      throw new AvatarEmojiApiError('Old avatar response lost');
    });
    await expect(f.service.publish(f.image())).rejects.toThrow('lost');
    const result = await f.service.publish(f.image('content-b'));
    expect(f.assets.get(f.image().hash)).toMatchObject({
      remotePending: false,
      fileId: 'document:1',
      customEmojiId: '6000000000000001',
    });
    expect(result).toMatchObject({
      createdDocument: true,
      fileId: 'document:2',
    });
    expect(f.api.createPack).toHaveBeenCalledTimes(1);
    expect(f.api.addToPack).toHaveBeenCalledTimes(1);
    expect([...f.remote.values()].flat()).toHaveLength(2);
    expect(f.api.upload).toHaveBeenCalledTimes(2);
  });

  it('does not reconcile another bot pending pack or send a new avatar', async () => {
    const f = fixture();
    f.api.createPack.mockRejectedValueOnce(
      new AvatarEmojiApiError('Old avatar outcome unknown'),
    );
    await expect(f.service.publish(f.image())).rejects.toThrow('unknown');
    f.packs.set(1, { id: 1, shortName: 'avatars_by_anotherbot' });
    const reads = f.api.getPack.mock.calls.length;
    await expect(f.service.publish(f.image('content-b'))).rejects.toThrow(
      'Another bot',
    );
    expect(f.api.getPack).toHaveBeenCalledTimes(reads);
    expect(f.api.upload).toHaveBeenCalledTimes(1);
  });

  it.each([
    'data:image/png;base64,!!!!',
    `data:image/png;base64,${'a'.repeat(140_000)}`,
  ])(
    'rejects malformed or oversized stored pending PNG before remote lookup',
    async (imageUrl) => {
      const f = fixture();
      f.api.createPack.mockRejectedValueOnce(
        new AvatarEmojiApiError('Old avatar outcome unknown'),
      );
      await expect(f.service.publish(f.image())).rejects.toThrow('unknown');
      f.assets.get(f.image().hash)!.imageUrl = imageUrl;
      const reads = f.api.getPack.mock.calls.length;
      await expect(f.service.publish(f.image('content-b'))).rejects.toThrow(
        'unavailable',
      );
      expect(f.api.getPack).toHaveBeenCalledTimes(reads);
      expect(f.api.upload).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects a changed pending source hash rather than adopting an unrelated image', async () => {
    const f = fixture();
    f.api.createPack.mockRejectedValueOnce(
      new AvatarEmojiApiError('Old avatar outcome unknown'),
    );
    await expect(f.service.publish(f.image())).rejects.toThrow('unknown');
    f.assets.get(f.image().hash)!.imageUrl = f.image('content-b').imageUrl;
    await expect(f.service.publish(f.image('content-b'))).rejects.toThrow(
      'identity',
    );
    expect(f.api.upload).toHaveBeenCalledTimes(1);
  });
});

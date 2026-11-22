import { createHash } from 'node:crypto';
import { B2ObjectStorageService } from './b2-object-storage.service';

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, json: async () => body }) as Response;

describe('B2ObjectStorageService', () => {
  const config = {
    get: jest.fn(
      (name: string) =>
        ({
          B2_KEY_ID: 'key-id',
          B2_APP_KEY: 'app-key',
          B2_BUCKET_NAME: 'bucket',
          B2_ENDPOINT: 'https://cdn.test',
        })[name],
    ),
  };

  beforeEach(() => jest.restoreAllMocks());

  function mockB2(existingKeys = new Set<string>(), rejections: Array<{ status: number; code: string }> = []) {
    const uploadedKeys: string[] = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('b2_authorize_account')) {
        return jsonResponse({
          apiUrl: 'https://api.test',
          authorizationToken: 'account-token',
          accountId: 'account',
          downloadUrl: 'https://download.test',
        });
      }
      if (url.includes('b2_list_buckets')) {
        return jsonResponse({
          buckets: [{ bucketId: 'bucket-id', bucketName: 'bucket' }],
        });
      }
      if (url.includes('b2_list_file_names')) {
        const key = JSON.parse(String(init?.body)).prefix as string;
        return jsonResponse({
          files: existingKeys.has(key) ? [{ fileName: key }] : [],
        });
      }
      if (url.includes('b2_get_upload_url')) {
        return jsonResponse({
          uploadUrl: 'https://upload.test',
          authorizationToken: 'upload-token',
        });
      }
      if (url === 'https://upload.test') {
        uploadedKeys.push(
          decodeURIComponent(
            String((init?.headers as Record<string, string>)['X-Bz-File-Name']),
          ),
        );
        const rejection = rejections[uploadedKeys.length - 1];
        if (rejection)
          return Response.json({ code: rejection.code }, {
            status: rejection.status,
            headers: { 'retry-after': '0' },
          });
        return jsonResponse({});
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    return uploadedKeys;
  }

  it('uses a SHA-256 MIME-aware key and uploads a new immutable image once', async () => {
    const uploads = mockB2();
    const service = new B2ObjectStorageService(config as never);
    const bytes = Buffer.from('jpeg-bytes');
    const hash = createHash('sha256').update(bytes).digest('hex');

    const result = await service.persistImmutableImages([
      { bytes, mimeType: 'image/jpeg' },
    ]);

    expect(uploads).toEqual([
      `telegram/post-images/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.jpg`,
    ]);
    expect(result).toEqual({
      urls: [`https://cdn.test/${uploads[0]}`],
      uploaded: 1,
      reused: 0,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://upload.test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'image/jpeg',
          'X-Bz-Content-Sha1': createHash('sha1').update(bytes).digest('hex'),
          'X-Bz-Info-b2-cache-control': encodeURIComponent(
            'public, max-age=31536000, immutable',
          ),
        }),
      }),
    );
  });

  it('requests a fresh upload URL after a transient rejection', async () => {
    const uploads = mockB2(new Set(), [{ status: 503, code: 'service_unavailable' }]);
    const service = new B2ObjectStorageService(config as never);
    const result = await service.persistImmutableImages([
      { bytes: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
    ]);
    expect(result.uploaded).toBe(1);
    expect(uploads).toHaveLength(2);
    expect(jest.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).includes('b2_get_upload_url'),
    )).toHaveLength(2);
  });

  it('recovers from repeated congestion using fresh targets and the same immutable key', async () => {
    const uploads = mockB2(new Set(), Array.from({ length: 3 }, () => ({
      status: 503,
      code: 'too_busy',
    })));
    const service = new B2ObjectStorageService(config as never);

    expect((await service.persistImmutableImages([
      { bytes: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
    ])).uploaded).toBe(1);
    expect(uploads).toHaveLength(4);
    expect(new Set(uploads).size).toBe(1);
    expect(jest.mocked(fetch).mock.calls.filter(([url]) =>
      String(url).includes('b2_get_upload_url'),
    )).toHaveLength(4);
  });

  it('deduplicates equal bytes within one operation while preserving image slots', async () => {
    const uploads = mockB2();
    const service = new B2ObjectStorageService(config as never);
    const image = { bytes: Buffer.from('same'), mimeType: 'image/png' };

    const result = await service.persistImmutableImages([image, image]);

    expect(uploads).toHaveLength(1);
    expect(result.urls).toEqual([result.urls[0], result.urls[0]]);
  });

  it('reuses an exact existing B2 key without creating another version', async () => {
    const bytes = Buffer.from('existing');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const key = `telegram/post-images/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.webp`;
    const uploads = mockB2(new Set([key]));
    const service = new B2ObjectStorageService(config as never);

    const result = await service.persistImmutableImages([
      { bytes, mimeType: 'image/webp' },
    ]);

    expect(uploads).toHaveLength(0);
    expect(result).toEqual({
      urls: [`https://cdn.test/${key}`],
      uploaded: 0,
      reused: 1,
    });
  });

  it('uses different keys for different content', async () => {
    const uploads = mockB2();
    const service = new B2ObjectStorageService(config as never);

    await service.persistImmutableImages([
      { bytes: Buffer.from('one'), mimeType: 'image/jpeg' },
      { bytes: Buffer.from('two'), mimeType: 'image/jpeg' },
    ]);

    expect(new Set(uploads).size).toBe(2);
  });
});

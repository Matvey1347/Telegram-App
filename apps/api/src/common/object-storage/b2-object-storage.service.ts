import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

type B2Context = {
  apiUrl: string;
  authorizationToken: string;
  bucketId: string;
  bucketName: string;
  publicBaseUrl: string;
};

export type ImmutableImage = { bytes: Buffer; mimeType: string };

export type ImmutableImageUploadResult = {
  urls: string[];
  uploaded: number;
  reused: number;
};

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isSupportedImmutableImageMimeType(value: string) {
  const mimeType = value.toLowerCase().split(';', 1)[0].trim();
  return Boolean(mimeExtensions[mimeType]);
}

@Injectable()
export class B2ObjectStorageService {
  constructor(private readonly config: ConfigService) {}

  async persistImmutableImages(
    images: ImmutableImage[],
  ): Promise<ImmutableImageUploadResult> {
    if (!images.length) return { urls: [], uploaded: 0, reused: 0 };
    const context = await this.context();
    const operation = new Map<
      string,
      Promise<{ url: string; uploaded: boolean }>
    >();
    const results: Array<{ url: string; uploaded: boolean }> = [];
    for (let offset = 0; offset < images.length; offset += 4) {
      await Promise.all(
        images.slice(offset, offset + 4).map(async (image, localIndex) => {
          const mimeType = image.mimeType.toLowerCase().split(';', 1)[0].trim();
          const extension = mimeExtensions[mimeType];
          if (!extension) {
            throw new InternalServerErrorException(
              'Unsupported immutable image content type.',
            );
          }
          const hash = createHash('sha256').update(image.bytes).digest('hex');
          const key = `telegram/post-images/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.${extension}`;
          let pending = operation.get(hash);
          if (!pending) {
            pending = this.persistOne(context, key, image.bytes, mimeType);
            operation.set(hash, pending);
          }
          results[offset + localIndex] = await pending;
        }),
      );
    }
    const uniqueResults = await Promise.all(operation.values());
    return {
      urls: results.map((result) => result.url),
      uploaded: uniqueResults.filter((result) => result.uploaded).length,
      reused: uniqueResults.filter((result) => !result.uploaded).length,
    };
  }

  private async persistOne(
    context: B2Context,
    key: string,
    bytes: Buffer,
    mimeType: string,
  ) {
    if (await this.objectExists(context, key)) {
      return { url: this.publicUrl(context, key), uploaded: false };
    }
    const uploadUrlResponse = await fetch(
      `${context.apiUrl}/b2api/v2/b2_get_upload_url`,
      {
        method: 'POST',
        headers: {
          Authorization: context.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketId: context.bucketId }),
      },
    );
    if (!uploadUrlResponse.ok) {
      throw new InternalServerErrorException(
        'Failed to prepare immutable object upload.',
      );
    }
    const destination = (await uploadUrlResponse.json()) as {
      uploadUrl: string;
      authorizationToken: string;
    };
    const upload = await fetch(destination.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: destination.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(key),
        'Content-Type': mimeType,
        'Content-Length': String(bytes.length),
        'X-Bz-Content-Sha1': 'do_not_verify',
        'X-Bz-Info-b2-cache-control': encodeURIComponent(
          'public, max-age=31536000, immutable',
        ),
      },
      body: new Uint8Array(bytes),
    });
    if (!upload.ok) {
      throw new InternalServerErrorException(
        'Failed to persist immutable object.',
      );
    }
    return { url: this.publicUrl(context, key), uploaded: true };
  }

  private async objectExists(context: B2Context, key: string) {
    const response = await fetch(
      `${context.apiUrl}/b2api/v2/b2_list_file_names`,
      {
        method: 'POST',
        headers: {
          Authorization: context.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucketId: context.bucketId,
          startFileName: key,
          prefix: key,
          maxFileCount: 1,
        }),
      },
    );
    if (!response.ok) {
      throw new InternalServerErrorException(
        'Failed to check immutable object existence.',
      );
    }
    const result = (await response.json()) as {
      files?: Array<{ fileName?: string }>;
    };
    return result.files?.[0]?.fileName === key;
  }

  private async context(): Promise<B2Context> {
    const keyId = this.config.get<string>('B2_KEY_ID')?.trim();
    const appKey = this.config.get<string>('B2_APP_KEY')?.trim();
    const bucketName = this.config.get<string>('B2_BUCKET_NAME')?.trim();
    const endpoint = this.config.get<string>('B2_ENDPOINT')?.trim();
    if (!keyId || !appKey || !bucketName) {
      throw new InternalServerErrorException(
        'B2 storage configuration is incomplete.',
      );
    }
    const authorization = await fetch(
      'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${appKey}`).toString('base64')}`,
        },
      },
    );
    if (!authorization.ok) {
      throw new InternalServerErrorException(
        'Failed to authorize immutable object storage.',
      );
    }
    const auth = (await authorization.json()) as {
      apiUrl: string;
      authorizationToken: string;
      accountId: string;
      downloadUrl: string;
    };
    const buckets = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: 'POST',
      headers: {
        Authorization: auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accountId: auth.accountId, bucketName }),
    });
    if (!buckets.ok) {
      throw new InternalServerErrorException(
        'Failed to resolve immutable object storage bucket.',
      );
    }
    const bucket = (
      (await buckets.json()) as {
        buckets?: Array<{ bucketId: string; bucketName: string }>;
      }
    ).buckets?.find((item) => item.bucketName === bucketName);
    if (!bucket) {
      throw new InternalServerErrorException(
        'Immutable object storage bucket was not found.',
      );
    }
    const cleanEndpoint = endpoint?.replace(/\/+$/, '');
    const publicBaseUrl = !cleanEndpoint
      ? `${auth.downloadUrl}/file/${bucketName}`
      : /(^https?:\/\/)?s3\./i.test(cleanEndpoint) &&
          !new RegExp(`/${bucketName}(/|$)`, 'i').test(cleanEndpoint)
        ? `${cleanEndpoint}/${bucketName}`
        : cleanEndpoint;
    return {
      apiUrl: auth.apiUrl,
      authorizationToken: auth.authorizationToken,
      bucketId: bucket.bucketId,
      bucketName,
      publicBaseUrl,
    };
  }

  private publicUrl(context: B2Context, key: string) {
    return `${context.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}

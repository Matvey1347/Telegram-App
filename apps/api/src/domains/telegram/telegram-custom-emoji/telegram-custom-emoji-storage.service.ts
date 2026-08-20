import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type B2UploadContext = {
  apiUrl: string;
  authorizationToken: string;
  bucketId: string;
  bucketName: string;
  publicBaseUrl: string;
};

export const telegramCustomEmojiBrowserCorsRule = {
  corsRuleName: 'telegram-custom-emoji-browser-render',
  allowedOrigins: ['*'],
  allowedHeaders: ['range'],
  // Custom emoji URLs use B2's S3-compatible endpoint. It does not apply the
  // native download rule, so both operations are required for Lottie fetches.
  allowedOperations: ['b2_download_file_by_name', 's3_get'],
  exposeHeaders: ['content-length', 'content-type'],
  maxAgeSeconds: 86400,
} as const;

/** Stores immutable Telegram assets once at import time; no API/DB work occurs at render time. */
@Injectable()
export class TelegramCustomEmojiStorageService {
  constructor(private readonly config: ConfigService) {}

  private async context(): Promise<B2UploadContext> {
    const keyId = this.config.get<string>('B2_KEY_ID')?.trim();
    const appKey = this.config.get<string>('B2_APP_KEY')?.trim();
    const bucketName = this.config.get<string>('B2_BUCKET_NAME')?.trim();
    const endpoint = this.config.get<string>('B2_ENDPOINT')?.trim();
    if (!keyId || !appKey || !bucketName) {
      throw new InternalServerErrorException('B2 storage is required for Premium emoji assets. Configure B2_KEY_ID, B2_APP_KEY and B2_BUCKET_NAME.');
    }
    const auth = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${appKey}`).toString('base64')}` },
    });
    if (!auth.ok) throw new InternalServerErrorException('Failed to authorize Backblaze B2.');
    const authData = await auth.json() as { apiUrl: string; authorizationToken: string; accountId: string; downloadUrl: string };
    const buckets = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: 'POST', headers: { Authorization: authData.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: authData.accountId, bucketName }),
    });
    if (!buckets.ok) throw new InternalServerErrorException('Failed to resolve Backblaze B2 bucket.');
    const bucket = ((await buckets.json()) as { buckets?: Array<{ bucketId: string; bucketName: string; corsRules?: unknown[] }> }).buckets?.find((item) => item.bucketName === bucketName);
    if (!bucket) throw new InternalServerErrorException(`B2 bucket not found: ${bucketName}`);
    // Lottie must fetch JSON (unlike img/video). Configure this once on the
    // existing bucket so derived TGS assets are genuinely browser-readable.
    const cors = await fetch(`${authData.apiUrl}/b2api/v2/b2_update_bucket`, {
      method: 'POST',
      headers: { Authorization: authData.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: authData.accountId, bucketId: bucket.bucketId, corsRules: [...(bucket.corsRules ?? []).filter((rule: any) => rule?.corsRuleName !== telegramCustomEmojiBrowserCorsRule.corsRuleName), telegramCustomEmojiBrowserCorsRule] }),
    });
    if (!cors.ok) throw new InternalServerErrorException('Failed to configure browser access for Premium emoji render assets.');
    const cleanEndpoint = endpoint?.replace(/\/+$/, '');
    const publicBaseUrl = !cleanEndpoint ? `${authData.downloadUrl}/file/${bucketName}` : /(^https?:\/\/)?s3\./i.test(cleanEndpoint) && !new RegExp(`/${bucketName}(/|$)`, 'i').test(cleanEndpoint) ? `${cleanEndpoint}/${bucketName}` : cleanEndpoint;
    return { apiUrl: authData.apiUrl, authorizationToken: authData.authorizationToken, bucketId: bucket.bucketId, bucketName, publicBaseUrl };
  }

  async uploadMany(items: Array<{ key: string; bytes: Buffer; mimeType: string }>) {
    const context = await this.context();
    const urls = new Map<string, string>();
    // This bounded import-only fan-out is intentional: B2 issues one upload URL per object.
    for (const item of items) {
      const uploadUrl = await fetch(`${context.apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: 'POST', headers: { Authorization: context.authorizationToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ bucketId: context.bucketId }),
      });
      if (!uploadUrl.ok) throw new InternalServerErrorException('Failed to get Backblaze B2 upload URL.');
      const destination = await uploadUrl.json() as { uploadUrl: string; authorizationToken: string };
      const upload = await fetch(destination.uploadUrl, {
        method: 'POST', headers: { Authorization: destination.authorizationToken, 'X-Bz-File-Name': encodeURIComponent(item.key), 'Content-Type': item.mimeType, 'Content-Length': String(item.bytes.length), 'X-Bz-Content-Sha1': 'do_not_verify', 'Cache-Control': 'public, max-age=31536000, immutable' }, body: new Uint8Array(item.bytes),
      });
      if (!upload.ok) throw new InternalServerErrorException(`Failed to persist Premium emoji asset ${item.key}.`);
      urls.set(item.key, `${context.publicBaseUrl}/${item.key.split('/').map(encodeURIComponent).join('/')}`);
    }
    return urls;
  }
}

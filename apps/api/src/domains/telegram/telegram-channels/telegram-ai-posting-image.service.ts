import { BadGatewayException, HttpException, Injectable, Optional } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../../prisma/prisma.service';
import { decodeAiPostingRunPublications } from './telegram-ai-posting-run-data';
import { AiGateway } from '../../operations/ai/ai-gateway';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import {
  addTelegramAiPostingAvatarWatermark,
  createTelegramAiPostingReferenceSheet,
} from './telegram-ai-posting-image-reference';

type ImageOperation = {
  stage: 'image';
  attempt: number;
  operationId: string;
  category: string;
  model: string;
  status: string;
  actualCost: string | null;
  pricingStatus: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type TelegramAiPostingMediaReadiness = 'READY' | 'MISSING' | 'FAILED';

type ImageResolution = {
  image: { url: string; sourceId: string; previewUrl?: string | null; fingerprint?: string; originalUrl?: string } | null;
  readiness: TelegramAiPostingMediaReadiness;
  failureCode?: string;
  operation?: ImageOperation;
  costUnknown?: boolean;
};

const storageFailureCodes: Record<string, string> = {
  'B2 storage configuration is incomplete.':
    'AI_POSTING_IMAGE_STORAGE_CONFIG_MISSING',
  'Failed to authorize immutable object storage.':
    'AI_POSTING_IMAGE_STORAGE_AUTH_FAILED',
  'Failed to resolve immutable object storage bucket.':
    'AI_POSTING_IMAGE_STORAGE_BUCKET_FAILED',
  'Immutable object storage bucket was not found.':
    'AI_POSTING_IMAGE_STORAGE_BUCKET_FAILED',
  'Failed to check immutable object existence.':
    'AI_POSTING_IMAGE_STORAGE_CHECK_FAILED',
  'Failed to prepare immutable object upload.':
    'AI_POSTING_IMAGE_STORAGE_UPLOAD_PREPARE_FAILED',
  'Failed to persist immutable object.':
    'AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED',
  'Unsupported immutable image content type.':
    'AI_POSTING_IMAGE_STORAGE_CONTENT_TYPE_UNSUPPORTED',
};

function imageStorageFailureCode(error: unknown) {
  const response = error instanceof HttpException ? error.getResponse() : null;
  if (response && typeof response === 'object' && 'storageCode' in response &&
    typeof response.storageCode === 'string' && /^[a-z_]{1,40}$/.test(response.storageCode))
    return `AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED_${response.storageCode.toUpperCase()}`;
  const message =
    typeof response === 'string'
      ? response
      : response && typeof response === 'object' && 'message' in response
        ? (response as { message?: unknown }).message
        : null;
  return typeof message === 'string'
    ? (storageFailureCodes[message] ?? 'AI_POSTING_IMAGE_STORAGE_FAILED')
    : 'AI_POSTING_IMAGE_STORAGE_FAILED';
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function normalizedPersistedImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function validBase64(value: string) {
  return Boolean(
    value &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    ),
  );
}

export function buildTelegramAiPostingImagePrompt(
  input: { topic: string; prompt: string; channelUsername?: string | null; channelTitle?: string | null },
  hasReference: boolean,
) {
  const candid =
    input.channelUsername?.replace(/^@/, '').toLowerCase() === 'women_power' ||
    /^жіноча сила(?:\s*🍃)?$/iu.test(input.channelTitle?.trim() ?? '');
  return [
    `Create an editorial visual for a Telegram post about ${input.topic}.`,
    input.prompt,
    hasReference
      ? 'Use the attached reference as guidance for style, palette and composition. Create an original scene.'
      : '',
    candid
      ? 'For photographic directions, use an unposed, everyday documentary frame. Show the emotion through a particular gesture, physical distance or ordinary action tied to the post. Use an ordinary setting with traces of use, available light, natural skin texture, restrained colors and an imperfect crop. People may look away, be mid-action or be partly out of frame. When a gesture or detail carries the idea, a face is optional. Avoid model poses, smiles for the camera, glamour retouching, stock-photo metaphors, staged props, glossy lighting, flawless skin and artificial bokeh. Keep explicitly requested non-photographic styles.'
      : 'If the requested direction is photographic, preserve natural light, plausible anatomy and lived-in details. Avoid stock-photo poses and cosmetic retouching.',
    'Avoid unnecessary text or watermarks.',
  ].filter(Boolean).join(' ');
}

@Injectable()
export class TelegramAiPostingImageService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly sources: TelegramAiPostingSourceService,
    private readonly media: TelegramManagedPostMediaStorageService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async renderBotWatermark(url: string, avatarUrl: string | null | undefined, settings: {
    size: number; opacity: number; x: number; y: number;
  }) {
    const avatar = await this.prepareChannelAvatar(avatarUrl);
    if (!avatar) throw new BadGatewayException('AI_POSTING_IMAGE_AVATAR_UNAVAILABLE');
    const original = await this.sources.downloadImage(url);
    const bytes = await addTelegramAiPostingAvatarWatermark(
      original, avatar, settings.size, settings.opacity, settings.x, settings.y,
    );
    const [result] = await this.media.persistImageBytes([{ bytes }]);
    const imageUrl = normalizedPersistedImageUrl(result);
    if (!imageUrl) throw new BadGatewayException('AI_POSTING_IMAGE_STORAGE_FAILED');
    return imageUrl;
  }

  async prepareReferenceSheet(urls: unknown) {
    const references = Array.isArray(urls)
      ? urls.filter((value): value is string => typeof value === 'string')
      : [];
    if (!references.length) return { image: null, failed: false };
    try {
      return {
        image: await createTelegramAiPostingReferenceSheet(references, (url) =>
          this.sources.downloadImage(url),
        ),
        failed: false,
      };
    } catch {
      return { image: null, failed: true };
    }
  }

  async prepareChannelAvatar(url: unknown) {
    if (typeof url !== 'string' || !url.trim()) return null;
    try {
      const data =
        /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
          url,
        );
      const bytes = data
        ? Buffer.from(data[1], 'base64')
        : await this.sources.downloadImage(url);
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) return null;
      const { width, height } = await sharp(bytes, {
        limitInputPixels: 40_000_000,
      }).metadata();
      return width && height ? bytes : null;
    } catch {
      return null;
    }
  }

  async resolve(input: {
    userId: string;
    workspaceId: string;
    channelId: string;
    channelUsername?: string | null;
    channelTitle?: string | null;
    topic: string;
    imageMode: string;
    imageCandidates: Array<{
      url: string;
      sourceId: string;
      sourceType: string;
    }>;
    prompt: string;
    searchQuery?: string;
    usedImages?: ReadonlySet<string>;
    referenceImage?: Buffer | null;
    referenceImageFailed?: boolean;
    referenceImageUrls?: unknown;
    channelAvatar?: Buffer | null;
    channelAvatarUrl?: string | null;
    watermarkChannelAvatar?: boolean;
    watermarkSizePercent?: number;
    watermarkX?: number;
    watermarkY?: number;
    watermarkOpacityPercent?: number;
    mode?: 'MANUAL' | 'AUTOMATIC';
    aiPosting?: {
      channelId: string;
      testRunId?: string;
      autopilotRunId?: string;
      publicationIndex?: number;
      attempt?: number;
      postingMode: 'TEST' | 'AUTOMATIC';
      dailyBudget?: string | null;
      monthlyBudget?: string | null;
    };
  }): Promise<ImageResolution> {
    const reference = input.referenceImageUrls
      ? await this.prepareReferenceSheet(input.referenceImageUrls)
      : {
          image: input.referenceImage ?? null,
          failed: input.referenceImageFailed ?? false,
        };
    const referenceImage = reference.image;
    const avatar = input.watermarkChannelAvatar
      ? input.channelAvatarUrl
        ? await this.prepareChannelAvatar(input.channelAvatarUrl)
        : (input.channelAvatar ?? null)
      : null;
    if (input.watermarkChannelAvatar && !avatar)
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_AVATAR_UNAVAILABLE',
      };
    const used = await this.usedChannelImages(input.workspaceId, input.channelId);
    for (const key of input.usedImages ?? []) used.add(key);
    const searchTurn = input.imageMode === 'hybrid';
    let candidates = input.imageCandidates;
    if (searchTurn) {
      try {
        const found = await this.sources.searchOpenImages(
          input.searchQuery || input.topic,
          1 + (Math.floor((input.aiPosting?.publicationIndex ?? 0) / 2) % 3),
        );
        const offset = found.length ? randomInt(found.length) : 0;
        candidates = [
          ...found.slice(offset),
          ...found.slice(0, offset),
          ...candidates,
        ];
      } catch {
        // Search is optional in hybrid mode; fall back to configured sources and AI.
      }
    }
    if (input.imageMode === 'found' || searchTurn) {
      for (const candidate of candidates.slice(0, 3)) {
        if (candidate.sourceId === 'channel-history' || used.has(candidate.url)) continue;
        let bytes: Buffer;
        let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
        try {
          bytes = await this.sources.downloadImage(candidate.url);
          if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue;
          const decoder = sharp(bytes, {
            limitInputPixels: 40_000_000,
          });
          metadata = await decoder.metadata();
          await decoder.stats();
          if (!this.qualityAccepted(metadata.width, metadata.height)) continue;
        } catch {
          // Unavailable, corrupted, unsupported, or unsuitable sources are skipped.
          continue;
        }
        const fingerprint = createHash("sha256").update(bytes).digest("hex");
        if (used.has(fingerprint)) continue;
        try {
          const brandedBytes = avatar
            ? await addTelegramAiPostingAvatarWatermark(
                bytes,
                avatar,
                input.watermarkSizePercent,
                input.watermarkOpacityPercent,
                input.watermarkX,
                input.watermarkY,
              )
            : bytes;
          const [url] = await this.media.persistImageBytes([
            {
              bytes: brandedBytes,
              contentType: avatar
                ? 'image/jpeg'
                : metadata.format
                  ? `image/${metadata.format}`
                  : undefined,
            },
          ]);
          const persistedUrl = normalizedPersistedImageUrl(url);
          if (!persistedUrl) {
            return {
              image: null,
              readiness: 'FAILED',
              failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
            };
          }
          const previewUrl = input.aiPosting?.postingMode === "TEST" && !avatar
            ? persistedUrl
            : await this.originalPreview(input.aiPosting?.postingMode, avatar, bytes);
          return {
            image: {
              url: persistedUrl,
              sourceId: candidate.sourceId,
              ...(this.prisma ? { fingerprint, originalUrl: candidate.url } : {}),
              ...(previewUrl ? { previewUrl } : {}),
            },
            readiness: 'READY',
          };
        } catch (error) {
          if (input.imageMode === 'hybrid')
            return {
              image: null,
              readiness: 'FAILED',
              failureCode: imageStorageFailureCode(error),
            };
          return {
            image: null,
            readiness: 'FAILED',
            failureCode: imageStorageFailureCode(error),
          };
        }
      }
    }
    if (input.imageMode === 'found')
      return { image: null, readiness: 'MISSING' };
    if (reference.failed)
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_REFERENCE_UNAVAILABLE',
      };

    let response: Awaited<ReturnType<AiGateway['execute']>>;
    try {
      response = await this.gateway.execute({
        userId: input.userId,
        workspaceId: input.workspaceId,
        category: 'TELEGRAM_POSTING_IMAGE',
        operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
        mode: input.mode ?? 'MANUAL',
        input: buildTelegramAiPostingImagePrompt(input, Boolean(referenceImage)),
        businessObjectId: input.channelId,
        aiPosting: input.aiPosting,
        ...(referenceImage
          ? { image: { mime: 'image/jpeg' as const, data: referenceImage } }
          : {}),
      });
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : undefined;
      const errorCode =
        response && typeof response === 'object' && 'message' in response
          ? (response as { message?: unknown }).message
          : response;
      return {
        image: null,
        readiness: 'FAILED',
        failureCode:
          errorCode === 'AI_REQUEST_BUDGET_EXCEEDED'
            ? 'AI_REQUEST_BUDGET_EXCEEDED'
            : 'AI_POSTING_IMAGE_PROVIDER_FAILED',
        ...(errorCode === 'AI_SETTLEMENT_UNCERTAIN'
          ? { costUnknown: true }
          : {}),
      };
    }
    const operation: ImageOperation = {
      stage: 'image',
      attempt: input.aiPosting?.attempt ?? 1,
      operationId: response.operation.operationId,
      category: response.operation.category,
      model: response.operation.model,
      status: response.operation.status,
      actualCost: response.operation.actualCost,
      pricingStatus: response.operation.pricingStatus,
      inputTokens: response.operation.inputTokens,
      outputTokens: response.operation.outputTokens,
    };
    if (
      response.operation.status !== 'SUCCEEDED' ||
      !response.result ||
      typeof response.result !== 'object'
    )
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED',
        operation,
      };
    const encoded = (response.result as { imageBase64?: unknown }).imageBase64;
    if (
      typeof encoded !== 'string' ||
      encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
      !validBase64(encoded)
    )
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
        operation,
      };
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
        operation,
      };
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      const decoder = sharp(bytes, { limitInputPixels: 40_000_000 });
      metadata = await decoder.metadata();
      await decoder.stats();
    } catch {
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
        operation,
      };
    }
    if (!this.qualityAccepted(metadata.width, metadata.height))
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_QUALITY_INVALID',
        operation,
      };
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    if (used.has(fingerprint))
      return { image: null, readiness: 'FAILED', failureCode: 'AI_POSTING_IMAGE_DUPLICATE', operation };
    try {
      const brandedBytes = avatar
        ? await addTelegramAiPostingAvatarWatermark(
            bytes,
            avatar,
            input.watermarkSizePercent,
            input.watermarkOpacityPercent,
            input.watermarkX,
            input.watermarkY,
          )
        : bytes;
      const [url] = await this.media.persistImageBytes([
        {
          bytes: brandedBytes,
          contentType: avatar
            ? 'image/jpeg'
            : metadata.format
              ? `image/${metadata.format}`
              : undefined,
        },
      ]);
      const persistedUrl = normalizedPersistedImageUrl(url);
      if (!persistedUrl)
        return {
          image: null,
          readiness: 'FAILED',
          failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
          operation,
        };
      const previewUrl = input.aiPosting?.postingMode === "TEST" && !avatar
            ? persistedUrl
            : await this.originalPreview(input.aiPosting?.postingMode, avatar, bytes);
      return {
        image: {
          url: persistedUrl,
          sourceId: 'openai-image-generation',
          ...(this.prisma ? { fingerprint } : {}),
          ...(previewUrl ? { previewUrl } : {}),
        },
        readiness: 'READY',
        operation,
      };
    } catch (error) {
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: imageStorageFailureCode(error),
        operation,
      };
    }
  }

  private async usedChannelImages(workspaceId: string, telegramChannelId: string) {
    const used = new Set<string>();
    if (!this.prisma) return used;
    const where = { workspaceId, telegramChannelId };
    const [posts, managed, runs] = await Promise.all([
      this.prisma.telegramPost.findMany({ where, select: { imageUrls: true } }),
      this.prisma.telegramManagedPost.findMany({ where, select: { imageUrls: true } }),
      this.prisma.telegramAiPostingTestRun.findMany({ where, select: { publications: true } }),
    ]);
    const add = (value: unknown) => {
      if (typeof value !== 'string' || !value) return;
      used.add(value);
      const hash = value.match(/\/([a-f0-9]{64})\.[a-z]+(?:[?#]|$)/i)?.[1];
      if (hash) used.add(hash);
    };
    for (const post of [...posts, ...managed]) post.imageUrls.forEach(add);
    for (const run of runs) {
      for (const item of decodeAiPostingRunPublications(run.publications).publications) {
        if (!item || typeof item !== 'object') continue;
        const post = item as Record<string, unknown>;
        for (const key of ['imageUrl', 'imagePreviewUrl', 'imageFingerprint', 'imageOriginalUrl']) add(post[key]);
      }
    }
    return used;
  }

  private async originalPreview(
    mode: string | undefined,
    avatar: Buffer | null,
    bytes: Buffer,
  ): Promise<string | null> {
    if (mode !== 'TEST' || !avatar) return null;
    try {
      const [url] = await this.media.persistImageBytes([{ bytes }]);
      return normalizedPersistedImageUrl(url);
    } catch {
      return null;
    }
  }

  private qualityAccepted(width?: number, height?: number) {
    return Boolean(
      width &&
      height &&
      width >= 320 &&
      height >= 320 &&
      Math.max(width / height, height / width) <= 3,
    );
  }
}

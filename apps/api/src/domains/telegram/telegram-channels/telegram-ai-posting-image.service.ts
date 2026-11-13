import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import sharp from 'sharp';
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
  image: { url: string; sourceId: string } | null;
  readiness: TelegramAiPostingMediaReadiness;
  failureCode?: string;
  operation?: ImageOperation;
  costUnknown?: boolean;
};

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

@Injectable()
export class TelegramAiPostingImageService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly sources: TelegramAiPostingSourceService,
    private readonly media: TelegramManagedPostMediaStorageService,
  ) {}

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
      const bytes = await this.sources.downloadImage(url);
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
    topic: string;
    imageMode: string;
    imageCandidates: Array<{
      url: string;
      sourceId: string;
      sourceType: string;
    }>;
    prompt: string;
    searchQuery?: string;
    referenceImage?: Buffer | null;
    referenceImageFailed?: boolean;
    referenceImageUrls?: unknown;
    channelAvatar?: Buffer | null;
    channelAvatarUrl?: string | null;
    watermarkChannelAvatar?: boolean;
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
    const searchTurn =
      input.imageMode === 'hybrid' &&
      (input.aiPosting?.publicationIndex ?? 0) % 2 === 0;
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
        try {
          const brandedBytes = avatar
            ? await addTelegramAiPostingAvatarWatermark(bytes, avatar)
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
            if (input.imageMode === 'hybrid') break;
            return {
              image: null,
              readiness: 'FAILED',
              failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
            };
          }
          return {
            image: { url: persistedUrl, sourceId: candidate.sourceId },
            readiness: 'READY',
          };
        } catch {
          if (input.imageMode === 'hybrid') break;
          return {
            image: null,
            readiness: 'FAILED',
            failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
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
        input: `Create a clean editorial illustration for a Telegram post about ${input.topic}. ${input.prompt}. ${referenceImage ? 'Use the attached reference sheet as visual guidance for style, palette and composition. Create an original image; do not copy its exact subject or layout.' : ''} No text, watermarks, recognizable copyrighted characters, or logos.`,
        businessObjectId: input.channelId,
        aiPosting: input.aiPosting,
        ...(referenceImage
          ? { image: { mime: 'image/jpeg' as const, data: referenceImage } }
          : {}),
      });
    } catch (error) {
      const response =
        error instanceof ServiceUnavailableException
          ? error.getResponse()
          : undefined;
      const errorCode =
        response && typeof response === 'object' && 'message' in response
          ? (response as { message?: unknown }).message
          : response;
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_PROVIDER_FAILED',
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
    try {
      const brandedBytes = avatar
        ? await addTelegramAiPostingAvatarWatermark(bytes, avatar)
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
      return {
        image: { url: persistedUrl, sourceId: 'openai-image-generation' },
        readiness: 'READY',
        operation,
      };
    } catch {
      return {
        image: null,
        readiness: 'FAILED',
        failureCode: 'AI_POSTING_IMAGE_STORAGE_FAILED',
        operation,
      };
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

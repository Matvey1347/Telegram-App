import { BadGatewayException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AiGateway } from '../../operations/ai/ai-gateway';
import { TelegramManagedPostMediaStorageService } from './telegram-managed-post-media-storage.service';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';

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

@Injectable()
export class TelegramAiPostingImageService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly sources: TelegramAiPostingSourceService,
    private readonly media: TelegramManagedPostMediaStorageService,
  ) {}

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
  }): Promise<{
    image: { url: string; sourceId: string } | null;
    operation?: ImageOperation;
  }> {
    if (input.imageMode !== 'ai') {
      for (const candidate of input.imageCandidates.slice(0, 3)) {
        try {
          const bytes = await this.sources.downloadImage(candidate.url);
          const metadata = await sharp(bytes, {
            limitInputPixels: 40_000_000,
          }).metadata();
          if (!this.qualityAccepted(metadata.width, metadata.height)) continue;
          const [url] = await this.media.persistImageBytes([
            {
              bytes,
              contentType: metadata.format
                ? `image/${metadata.format}`
                : undefined,
            },
          ]);
          return { image: { url, sourceId: candidate.sourceId } };
        } catch {
          // Broken, unsupported, unauthorized, or low-quality images are skipped.
        }
      }
    }
    if (input.imageMode === 'found') return { image: null };

    const response = await this.gateway.execute({
      userId: input.userId,
      workspaceId: input.workspaceId,
      category: 'TELEGRAM_POSTING_IMAGE',
      operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
      mode: input.mode ?? 'MANUAL',
      input: `Create a clean editorial illustration for a Telegram post about ${input.topic}. ${input.prompt}. No text, watermarks, recognizable copyrighted characters, or logos.`,
      businessObjectId: input.channelId,
      aiPosting: input.aiPosting,
    });
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
      throw new BadGatewayException({
        code: `AI_POSTING_IMAGE_${response.operation.errorCategory ?? response.operation.status}`,
        operation,
      });
    const encoded = (response.result as { imageBase64?: unknown }).imageBase64;
    if (typeof encoded !== 'string')
      throw new BadGatewayException({
        code: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
        operation,
      });
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new BadGatewayException({
        code: 'AI_POSTING_IMAGE_OUTPUT_INVALID',
        operation,
      });
    const metadata = await sharp(bytes, {
      limitInputPixels: 40_000_000,
    }).metadata();
    if (!this.qualityAccepted(metadata.width, metadata.height))
      throw new BadGatewayException({
        code: 'AI_POSTING_IMAGE_QUALITY_INVALID',
        operation,
      });
    const [url] = await this.media.persistImageBytes([
      { bytes, contentType: 'image/jpeg' },
    ]);
    return { image: { url, sourceId: 'openai-image-generation' }, operation };
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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceAiProviderService } from '../ai/finance-ai.provider';
import { FinanceEntitlementService } from '../billing/finance-entitlement.service';
import { FinanceProposalService } from '../chat-flows/finance-proposal.service';

type AssistantIdentity = {
  profileId: string;
  botIntegrationId: string;
  telegramBotUserId: string;
  workspaceId: string;
};

const MAX_ASSISTANT_FILES = 5;
const MAX_ASSISTANT_TOTAL_BYTES = 16 * 1024 * 1024;

/** Shared, confirm-before-write AI entry flow for Web App and Mini App. */
@Injectable()
export class FinanceAssistantEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: FinanceAiProviderService,
    private readonly proposals: FinanceProposalService,
    private readonly entitlements: FinanceEntitlementService,
  ) {}

  async fromText(identity: AssistantIdentity, text: string, onProgress?: (completed: number, stage: 'UNDERSTANDING' | 'PREPARING' | 'CHECKING') => void, signal?: AbortSignal) {
    onProgress?.(0, 'UNDERSTANDING');
    if (signal?.aborted) throw signal.reason;
    const profile = await this.profile(identity.profileId);
    onProgress?.(1, 'PREPARING');
    const operations = await this.ai.extractText({
      profileId: identity.profileId,
      botIntegrationId: identity.botIntegrationId,
      text,
      timezone: profile.timezone,
      defaultCurrency: profile.defaultCurrency,
      signal,
    });
    if (signal?.aborted) throw signal.reason;
    onProgress?.(2, 'CHECKING');
    const categoryHint = explicitCategoryHint(text);
    const proposal = await this.propose(identity, profile, operations.map((operation) => ({
      ...operation,
      ...(categoryHint ? { categoryHint, description: stripExplicitCategoryLabel(operation.description) } : {}),
    })), 'AI');
    onProgress?.(3, 'CHECKING');
    return proposal;
  }

  async fromFile(identity: AssistantIdentity, file?: Express.Multer.File) {
    return this.fromFiles(identity, file ? [file] : []);
  }

  async fromFiles(identity: AssistantIdentity, files: Express.Multer.File[]) {
    if (!files.length || files.some((file) => !file.buffer?.length))
      throw new BadRequestException('At least one file is required');
    if (files.length > MAX_ASSISTANT_FILES)
      throw new BadRequestException('No more than 5 files are supported');
    if (
      files.reduce((total, file) => total + file.buffer.length, 0) >
      MAX_ASSISTANT_TOTAL_BYTES
    )
      throw new BadRequestException('Files exceed the 16 MB total limit');
    const profile = await this.profile(identity.profileId);
    const mime = files[0].mimetype.toLowerCase();
    const allImages = files.every((file) =>
      file.mimetype.toLowerCase().startsWith('image/'),
    );
    if (!allImages && files.length !== 1)
      throw new BadRequestException(
        'Upload up to 5 images or one audio file, without mixing them',
      );
    if (
      !allImages &&
      !(await this.entitlements.hasCapability(identity, 'VOICE_INPUT'))
    )
      throw new ForbiddenException('Voice input requires Pro or Ultimate');
    const operations = allImages
      ? await this.ai.extractReceipts({
          profileId: identity.profileId,
          botIntegrationId: identity.botIntegrationId,
          files: files.map((file) => ({
            bytes: file.buffer,
            mime: file.mimetype.toLowerCase(),
          })),
          timezone: profile.timezone,
          defaultCurrency: profile.defaultCurrency,
        })
      : await this.ai
          .transcribeVoice({
            profileId: identity.profileId,
            botIntegrationId: identity.botIntegrationId,
            bytes: files[0].buffer,
            mime,
          })
          .then((text) =>
            this.ai.extractText({
              profileId: identity.profileId,
              botIntegrationId: identity.botIntegrationId,
              text,
              timezone: profile.timezone,
              defaultCurrency: profile.defaultCurrency,
            }),
          );
    return this.propose(
      identity,
      profile,
      operations,
      allImages ? 'RECEIPT' : 'AI',
    );
  }

  async confirm(identity: AssistantIdentity, token: string) {
    const profile = await this.profile(identity.profileId);
    return this.proposals.confirm({
      token,
      botIntegrationId: identity.botIntegrationId,
      telegramBotUserId: identity.telegramBotUserId,
      profile: {
        id: identity.profileId,
        defaultCurrency: profile.defaultCurrency,
        workspaceId: identity.workspaceId,
      },
    });
  }

  cancel(identity: AssistantIdentity, token: string) {
    return this.proposals.cancel({
      token,
      botIntegrationId: identity.botIntegrationId,
      telegramBotUserId: identity.telegramBotUserId,
    });
  }

  revise(
    identity: AssistantIdentity,
    token: string,
    operations: Parameters<FinanceProposalService['revise']>[0]['operations'],
    keepIndices?: number[],
  ) {
    return this.proposals.revise({
      ...identity,
      profile: { id: identity.profileId },
      token,
      operations,
      keepIndices,
    });
  }

  private async profile(profileId: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { id: true, defaultCurrency: true, timezone: true },
    });
    if (!profile) throw new BadRequestException('Finance profile not found');
    return profile;
  }

  private async propose(
    identity: AssistantIdentity,
    profile: { id: string; defaultCurrency: string; timezone: string },
    operations: Parameters<
      FinanceProposalService['createBatch']
    >[0]['operations'],
    source: 'AI' | 'RECEIPT',
  ) {
    const proposal = await this.proposals.createBatch({
      profile,
      botIntegrationId: identity.botIntegrationId,
      telegramBotUserId: identity.telegramBotUserId,
      operations,
      source,
    });
    return {
      token: proposal.token,
      operations: proposal.preview.map((item) => ({
        type: item.payload.type,
        amount: item.payload.amount,
        economicAmount: item.payload.economicAmount,
        purpose: item.payload.purpose,
        necessity: item.payload.necessity,
        currency: item.payload.currency,
        description: item.payload.description || '',
        occurredAt: item.payload.occurredAt,
        accountId: item.payload.accountId,
        categoryId: item.payload.categoryId,
        accountName: item.accountName,
        categoryName: item.categoryName,
      })),
    };
  }
}

export function explicitCategoryHint(text: string) {
  return /(?:категори[яюи]|категорі[яюї]|category)\s*[:\-]?\s*([\p{L}\p{N}_-]+)/iu.exec(text)?.[1];
}

export function stripExplicitCategoryLabel(description: string) {
  return description.replace(/\s*[,([]?\s*(?:категори[яюи]|категорі[яюї]|category)\s*:?\s*[\p{L}\p{N}_-]+\s*[)\]]?\s*$/iu, '').trim() || description;
}

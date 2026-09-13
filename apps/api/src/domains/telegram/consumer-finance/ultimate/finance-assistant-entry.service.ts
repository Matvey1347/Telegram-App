import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { FinanceAiProviderService } from '../ai/finance-ai.provider';
import { FinanceProposalService } from '../chat-flows/finance-proposal.service';

type AssistantIdentity = {
  profileId: string;
  botIntegrationId: string;
  telegramBotUserId: string;
  workspaceId: string;
};

/** Shared, confirm-before-write AI entry flow for Web App and Mini App. */
@Injectable()
export class FinanceAssistantEntryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: FinanceAiProviderService,
    private readonly proposals: FinanceProposalService,
  ) {}

  async fromText(identity: AssistantIdentity, text: string) {
    const profile = await this.profile(identity.profileId);
    const operations = await this.ai.extractText({
      profileId: identity.profileId,
      botIntegrationId: identity.botIntegrationId,
      text,
      timezone: profile.timezone,
      defaultCurrency: profile.defaultCurrency,
    });
    return this.propose(identity, profile, operations, 'AI');
  }

  async fromFile(identity: AssistantIdentity, file?: Express.Multer.File) {
    if (!file?.buffer?.length)
      throw new BadRequestException('File is required');
    const profile = await this.profile(identity.profileId);
    const mime = file.mimetype.toLowerCase();
    const operations = mime.startsWith('image/')
      ? await this.ai.extractReceipt({
          profileId: identity.profileId,
          botIntegrationId: identity.botIntegrationId,
          bytes: file.buffer,
          mime,
          timezone: profile.timezone,
          defaultCurrency: profile.defaultCurrency,
        })
      : await this.ai
          .transcribeVoice({
            profileId: identity.profileId,
            botIntegrationId: identity.botIntegrationId,
            bytes: file.buffer,
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
      mime.startsWith('image/') ? 'RECEIPT' : 'AI',
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
        accountName: item.accountName,
        categoryName: item.categoryName,
      })),
    };
  }
}

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { FinanceAiConnectionStatus, FinanceAiProvider } from '@prisma/client';
import { TokenEncryptionService } from '../../../../common/security/token-encryption.service';
import { PrismaService } from '../../../../prisma/prisma.service';

/** Resolves the existing workspace/bot OpenAI configuration for runtime calls. */
@Injectable()
export class FinanceAiCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async key(profileId: string, botIntegrationId: string) {
    const profile = await this.prisma.financeProfile.findUnique({
      where: { id: profileId },
      select: { botIntegration: { select: { workspaceId: true } } },
    });
    if (!profile) throw new BadRequestException('Finance profile not found');
    const rows = await this.prisma.aiProviderConfig.findMany({
      where: {
        workspaceId: profile.botIntegration.workspaceId,
        provider: FinanceAiProvider.OPENAI,
        connectionStatus: FinanceAiConnectionStatus.CONNECTED,
        OR: [{ botIntegrationId }, { botIntegrationId: null }],
      },
    });
    const config =
      rows.find((row) => row.botIntegrationId === botIntegrationId) ||
      rows.find((row) => row.botIntegrationId === null);
    if (!config?.apiKeyEncrypted || !config.apiKeyIv || !config.apiKeyAuthTag) {
      throw new BadGatewayException('Finance AI provider is not connected');
    }
    return this.encryption.decrypt({
      encrypted: config.apiKeyEncrypted,
      iv: config.apiKeyIv,
      authTag: config.apiKeyAuthTag,
    });
  }
}

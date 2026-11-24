import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@api/prisma/prisma.service";
import { TokenEncryptionService } from "@api/common/security/token-encryption.service";

@Injectable()
export class FinanceAiCredentialService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async key(_profileId: string, botIntegrationId: string) {
    const bot = await this.prisma.telegramBotIntegration.findUnique({
      where: { id: botIntegrationId, applicationType: "FINANCE" },
      select: { workspaceId: true },
    });
    if (bot) {
      const rows = await this.prisma.aiProviderConfig.findMany({
        where: {
          workspaceId: bot.workspaceId,
          provider: "OPENAI",
          connectionStatus: "CONNECTED",
          OR: [{ botIntegrationId }, { botIntegrationId: null }],
        },
        select: {
          botIntegrationId: true,
          apiKeyEncrypted: true,
          apiKeyIv: true,
          apiKeyAuthTag: true,
          connectionStatus: true,
        },
        orderBy: { createdAt: "desc" },
      });
      const row =
        rows.find((item) => item.botIntegrationId === botIntegrationId) ??
        rows.find((item) => item.botIntegrationId === null);
      if (
        row?.connectionStatus === "CONNECTED" &&
        row.apiKeyEncrypted &&
        row.apiKeyIv &&
        row.apiKeyAuthTag
      )
        return this.encryption.decrypt({
          encrypted: row.apiKeyEncrypted,
          iv: row.apiKeyIv,
          authTag: row.apiKeyAuthTag,
        });
    }
    const key = this.config.get<string>("INTERNAL_AI_OPENAI_API_KEY")?.trim();
    if (!key)
      throw new BadGatewayException("Finance AI provider is not configured");
    return key;
  }
}

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { FinanceRuntimeConfig } from "../config/finance-runtime-config";
import { FinancePrismaService } from "../prisma/finance-prisma.service";
import { FinanceTelegramBotApiClient } from "../telegram/finance-telegram-bot-api.client";

type FinanceBotEnvironment = "LOCAL" | "PRODUCTION";

/**
 * A deliberately small, read-only projection for the Nexeloq admin host.
 * Finance remains the owner of its database; the dashboard never connects to
 * that database directly or recreates a legacy TelegramBotIntegration.
 */
@Injectable()
export class FinanceAdminAnalyticsService {
  constructor(
    private readonly config: FinanceRuntimeConfig,
    private readonly prisma: FinancePrismaService,
    private readonly botApi: FinanceTelegramBotApiClient,
  ) {}

  authorize(candidate: string | undefined, workspaceId: string | undefined) {
    const expected = this.config.adminAnalyticsToken;
    if (!expected) {
      throw new ServiceUnavailableException(
        "Finance admin analytics is not configured",
      );
    }
    if (!candidate || !safeEquals(expected, candidate)) {
      throw new UnauthorizedException(
        "Invalid Finance admin analytics credential",
      );
    }
    if (
      this.config.adminAnalyticsWorkspaceId &&
      workspaceId !== this.config.adminAnalyticsWorkspaceId
    ) {
      throw new UnauthorizedException(
        "Finance analytics is not assigned to this workspace",
      );
    }
  }

  async overview() {
    let bots;
    try {
      bots = await this.prisma.financeBot.findMany({
        where: { runtimeEnvironment: { not: null } },
        select: {
          id: true,
          runtimeEnvironment: true,
          telegramUsername: true,
          telegramDisplayName: true,
          telegramDescription: true,
          avatarFetchedAt: true,
          _count: { select: { telegramUsers: true, profiles: true } },
        },
        orderBy: { runtimeEnvironment: "asc" },
      });
    } catch (error) {
      if (isMissingFinanceHostTable(error)) {
        return { status: "MIGRATION_REQUIRED" as const, bots: [] };
      }
      throw error;
    }
    const configuredRuntimes = this.config
      .configuredBotRuntimes()
      .filter(
        (runtime) =>
          !bots.some((bot) => bot.runtimeEnvironment === runtime.environment),
      )
      .map((runtime) => ({
        id: `configured:${runtime.environment}`,
        runtimeEnvironment: runtime.environment,
        telegramUsername: runtime.username,
        telegramDisplayName: null,
        telegramDescription: null,
        avatarFetchedAt: null,
        _count: { telegramUsers: 0, profiles: 0 },
      }));
    return {
      status: "AVAILABLE" as const,
      bots: [...bots, ...configuredRuntimes].map((bot) => {
          const environment = bot.runtimeEnvironment as FinanceBotEnvironment;
          const runtime = this.config.botForEnvironment(environment);
          return {
            id: bot.id,
            environment,
            username: bot.telegramUsername ?? runtime?.username ?? null,
            name: bot.telegramDisplayName,
            description: bot.telegramDescription,
            avatarUpdatedAt: bot.avatarFetchedAt?.toISOString() ?? null,
            registeredUsers: bot._count.telegramUsers,
            profiles: bot._count.profiles,
          };
        }),
    };
  }

  async avatar(environment: FinanceBotEnvironment) {
    const runtime = this.config.botForEnvironment(environment);
    if (!runtime) return null;
    const cached = await this.prisma.financeBot.findUnique({
      where: { runtimeEnvironment: environment },
      select: {
        telegramUsername: true,
        avatarImage: true,
        avatarMimeType: true,
      },
    });
    if (cached?.telegramUsername === runtime.username) {
      return cached.avatarImage
        ? { bytes: Buffer.from(cached.avatarImage), contentType: cached.avatarMimeType ?? "image/jpeg" }
        : null;
    }
    return this.refreshAvatar(environment);
  }

  async refreshAvatars() {
    const environments = this.config.configuredBotRuntimes().map((runtime) => runtime.environment);
    await Promise.all(environments.map((environment) => this.refreshAvatar(environment)));
    return { refreshedEnvironments: environments };
  }

  async updateProfile(
    environment: FinanceBotEnvironment,
    input: { name?: string; description?: string },
  ) {
    const runtime = this.config.botForEnvironment(environment);
    if (!runtime) throw new BadRequestException("Finance bot runtime is not configured");
    const name = input.name?.trim();
    const hasDescription = input.description !== undefined;
    const description = input.description?.trim() ?? "";
    if (input.name !== undefined && !name) throw new BadRequestException("Bot name cannot be empty");
    if (!name && !hasDescription) throw new BadRequestException("A name or description is required");
    if (name) await this.botApi.setMyName(runtime.token, name);
    if (hasDescription) await this.botApi.setMyDescription(runtime.token, description);
    await this.prisma.financeBot.upsert({
      where: { runtimeEnvironment: environment },
      create: {
        runtimeEnvironment: environment,
        telegramUsername: runtime.username,
        ...(name ? { telegramDisplayName: name } : {}),
        ...(hasDescription ? { telegramDescription: description } : {}),
      },
      update: {
        telegramUsername: runtime.username,
        ...(name ? { telegramDisplayName: name } : {}),
        ...(hasDescription ? { telegramDescription: description } : {}),
      },
    });
    return this.overview();
  }

  private async refreshAvatar(environment: FinanceBotEnvironment) {
    const runtime = this.config.botForEnvironment(environment);
    if (!runtime) return null;
    const bot = await this.botApi.getMe(runtime.token);
    const fileId = await this.botApi.getUserProfilePhoto(
      runtime.token,
      String(bot.id),
    );
    const avatar = await (fileId
      ? this.botApi.downloadFile(runtime.token, fileId)
      : this.botApi.downloadUsernameProfilePhoto(runtime.username));
    const name = (await this.botApi.getMyName(runtime.token)).name?.trim() || null;
    await this.prisma.financeBot.upsert({
      where: { runtimeEnvironment: environment },
      create: {
        runtimeEnvironment: environment,
        telegramUsername: runtime.username,
        telegramDisplayName: name,
        telegramDescription: null,
        avatarImage: avatar ? avatar.bytes : null,
        avatarMimeType: avatar?.contentType ?? null,
        avatarFetchedAt: new Date(),
      },
      update: {
        telegramUsername: runtime.username,
        telegramDisplayName: name,
        avatarImage: avatar ? avatar.bytes : null,
        avatarMimeType: avatar?.contentType ?? null,
        avatarFetchedAt: new Date(),
      },
    });
    return avatar;
  }

  async users(environment: FinanceBotEnvironment, cursor?: string) {
    const bot = await this.prisma.financeBot.findUnique({
      where: { runtimeEnvironment: environment },
      select: { id: true },
    });
    if (!bot) return { items: [], nextCursor: null };

    const rows = await this.prisma.financeTelegramUser.findMany({
      where: { financeBotId: bot.id },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        telegramUserId: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            defaultCurrency: true,
            _count: { select: { accounts: true, transactions: true } },
          },
        },
      },
    });
    const page = rows.slice(0, 50);
    return {
      items: page.map((user) => ({
        id: user.id,
        telegramUserId: user.telegramUserId,
        registeredAt: user.createdAt.toISOString(),
        lastActivityAt: user.updatedAt.toISOString(),
        profile: user.profile
          ? {
              defaultCurrency: user.profile.defaultCurrency,
              accounts: user.profile._count.accounts,
              transactions: user.profile._count.transactions,
            }
          : null,
      })),
      nextCursor: rows.length > page.length ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

function isMissingFinanceHostTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2021"
  );
}

function safeEquals(expected: string, candidate: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(candidate);
  return left.length === right.length && timingSafeEqual(left, right);
}

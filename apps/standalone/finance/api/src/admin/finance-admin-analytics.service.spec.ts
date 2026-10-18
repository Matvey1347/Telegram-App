import { UnauthorizedException } from "@nestjs/common";
import { FinanceAdminAnalyticsService } from "./finance-admin-analytics.service";

describe("FinanceAdminAnalyticsService", () => {
  const service = new FinanceAdminAnalyticsService(
    {
      adminAnalyticsToken: "a-long-enough-private-analytics-token",
      adminAnalyticsWorkspaceId: "business",
    } as never,
    {} as never,
    {} as never,
  );

  it("requires both the shared credential and assigned workspace", () => {
    expect(() =>
      service.authorize("a-long-enough-private-analytics-token", "business"),
    ).not.toThrow();
    expect(() => service.authorize("wrong", "business")).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      service.authorize("a-long-enough-private-analytics-token", "other"),
    ).toThrow(UnauthorizedException);
  });

  it("reports a migration requirement when the standalone Finance schema is absent", async () => {
    const analytics = new FinanceAdminAnalyticsService(
      { selectedBot: undefined } as never,
      {
        financeBot: {
          findMany: jest.fn().mockRejectedValue({ code: "P2021" }),
        },
      } as never,
      {} as never,
    );

    await expect(analytics.overview()).resolves.toEqual({
      status: "MIGRATION_REQUIRED",
      bots: [],
    });
  });

  it("lists every configured Finance environment before either bot receives a user", async () => {
    const runtimes = [
      { environment: "LOCAL" as const, username: "finance_local_bot" },
      { environment: "PRODUCTION" as const, username: "finance_prod_bot" },
    ];
    const analytics = new FinanceAdminAnalyticsService(
      {
        configuredBotRuntimes: () => runtimes,
        botForEnvironment: (environment: "LOCAL" | "PRODUCTION") =>
          runtimes.find((runtime) => runtime.environment === environment),
      } as never,
      {
        financeBot: { findMany: jest.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
    );

    await expect(analytics.overview()).resolves.toEqual({
      status: "AVAILABLE",
      bots: [
        {
          id: "configured:LOCAL",
          environment: "LOCAL",
          username: "finance_local_bot",
          name: null,
          description: null,
          avatarUpdatedAt: null,
          registeredUsers: 0,
          profiles: 0,
        },
        {
          id: "configured:PRODUCTION",
          environment: "PRODUCTION",
          username: "finance_prod_bot",
          name: null,
          description: null,
          avatarUpdatedAt: null,
          registeredUsers: 0,
          profiles: 0,
        },
      ],
    });
  });

  it("falls back to Telegram's public profile photo when Bot API omits the bot avatar", async () => {
    const analytics = new FinanceAdminAnalyticsService(
      {
        botForEnvironment: () => ({
          environment: "LOCAL",
          username: "finance_local_bot",
          token: "local-token",
        }),
      } as never,
      {
        financeBot: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
        },
      } as never,
      {
        getMe: jest.fn().mockResolvedValue({ id: 123 }),
        getUserProfilePhoto: jest.fn().mockResolvedValue(null),
        downloadUsernameProfilePhoto: jest
          .fn()
          .mockResolvedValue({
            bytes: Buffer.from("avatar"),
            contentType: "image/jpeg",
          }),
        getMyName: jest.fn().mockResolvedValue({ name: "Finance Bot" }),
      } as never,
    );

    await expect(analytics.avatar("LOCAL")).resolves.toEqual({
      bytes: Buffer.from("avatar"),
      contentType: "image/jpeg",
    });
  });

  it("returns a saved avatar without querying Telegram during dashboard rendering", async () => {
    const botApi = { getMe: jest.fn(), getUserProfilePhoto: jest.fn() };
    const analytics = new FinanceAdminAnalyticsService(
      {
        botForEnvironment: () => ({
          environment: "LOCAL",
          username: "finance_local_bot",
          token: "local-token",
        }),
      } as never,
      {
        financeBot: {
          findUnique: jest.fn().mockResolvedValue({
            telegramUsername: "finance_local_bot",
            avatarImage: Buffer.from("saved-avatar"),
            avatarMimeType: "image/png",
          }),
        },
      } as never,
      botApi as never,
    );

    await expect(analytics.avatar("LOCAL")).resolves.toEqual({
      bytes: Buffer.from("saved-avatar"),
      contentType: "image/png",
    });
    expect(botApi.getMe).not.toHaveBeenCalled();
  });
});

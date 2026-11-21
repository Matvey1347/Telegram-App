import { FinanceLocalDevelopmentService } from "@consumer-finance/api/http/finance-local-development.service";

describe("FinanceLocalDevelopmentService", () => {
  const previousControlSecret = process.env.LOCAL_DEV_BOTS_CONTROL_SECRET;

  afterEach(() => {
    if (previousControlSecret === undefined) {
      delete process.env.LOCAL_DEV_BOTS_CONTROL_SECRET;
    } else {
      process.env.LOCAL_DEV_BOTS_CONTROL_SECRET = previousControlSecret;
    }
  });

  it("replaces the historical LOCAL bot on the production-backed Finance integration", async () => {
    process.env.LOCAL_DEV_BOTS_CONTROL_SECRET = "control-secret";
    const findMany = jest.fn().mockResolvedValue([
      {
        id: "consumer-finance",
        runtimeInstances: [
          { environment: "PRODUCTION" },
          { environment: "LOCAL" },
        ],
      },
      {
        id: "empty-local-finance",
        runtimeInstances: [{ environment: "LOCAL" }],
      },
    ]);
    const configureRuntime = jest.fn().mockResolvedValue({
      username: "Groshly_dev_bot",
    });
    const productionBot = jest.fn().mockResolvedValue(null);
    const getWebhookInfo = jest.fn().mockResolvedValue({ url: "" });
    const service = new FinanceLocalDevelopmentService(
      {
        get: jest.fn((key: string) =>
          key === "FINANCE_BOT_LOCAL_TOKEN" ? "local-token" : "Groshly_dev_bot",
        ),
      } as never,
      { telegramBotIntegration: { findMany }, telegramBotRuntimeInstance: { findFirst: productionBot } } as never,
      { configureRuntime } as never,
      { current: jest.fn(() => "LOCAL") } as never,
      {
        getMe: jest.fn().mockResolvedValue({ id: 42, username: "Groshly_dev_bot" }),
        getWebhookInfo,
      } as never,
    );

    await expect(service.synchronize("control-secret")).resolves.toEqual({
      username: "Groshly_dev_bot",
      synchronized: true,
      botIntegrationId: "consumer-finance",
    });
    expect(configureRuntime).toHaveBeenCalledWith({
      botIntegrationId: "consumer-finance",
      environment: "LOCAL",
      token: "local-token",
    });
    configureRuntime.mockClear();
    productionBot.mockResolvedValueOnce({ id: "production-owner" });
    await expect(service.synchronize("control-secret")).rejects.toThrow(/assigned to production/u);
    getWebhookInfo.mockResolvedValueOnce({ url: "https://other-owner.example/webhook" });
    await expect(service.synchronize("control-secret")).rejects.toThrow(/has a webhook owner/u);
    expect(configureRuntime).not.toHaveBeenCalled();
  });
});

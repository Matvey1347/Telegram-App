import { NotFoundException } from "@nestjs/common";
import { TelegramBotApplicationType } from "@prisma/client";
import { FinanceBrowserContextService } from "@consumer-finance/api/http/finance-browser-context.service";

describe("FinanceBrowserContextService", () => {
  const findFirst = jest.fn();
  const browserLoginBotUsername = jest.fn<string | null, []>(() => null);
  const service = new FinanceBrowserContextService(
    {
      telegramBotIntegration: { findFirst },
    } as never,
    {
      current: jest.fn(() => "LOCAL"),
      browserLoginBotUsername,
    } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    browserLoginBotUsername.mockReturnValue(null);
  });

  it("resolves the LOCAL bot by the same persisted username used for authentication", async () => {
    browserLoginBotUsername.mockReturnValue("finance_local_bot");
    findFirst.mockResolvedValue({ id: "selected" });
    await expect(service.resolve()).resolves.toEqual({ financeBotId: "selected" });
    expect(findFirst.mock.calls[0][0].where.runtimeInstances.some).toEqual({
      environment: "LOCAL",
      username: { equals: "finance_local_bot", mode: "insensitive" },
    });
  });

  it("returns the configured LOCAL Finance bot even when webhook delivery is disabled", async () => {
    findFirst.mockResolvedValue({ id: "finance-bot-1" });

    await expect(service.resolve()).resolves.toEqual({
      financeBotId: "finance-bot-1",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        applicationType: TelegramBotApplicationType.FINANCE,
        isActive: true,
        runtimeInstances: {
          some: {
            environment: "LOCAL",
          },
        },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
  });

  it("reports an actionable not-found error when Finance has not been configured", async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.resolve()).rejects.toThrow(NotFoundException);
  });
});

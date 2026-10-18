import { NotFoundException } from "@nestjs/common";
import { TelegramBotApplicationType } from "@prisma/client";
import { FinanceBrowserContextService } from "@consumer-finance/api/http/finance-browser-context.service";

describe("FinanceBrowserContextService", () => {
  const findFirst = jest.fn();
  const service = new FinanceBrowserContextService(
    {
      telegramBotIntegration: { findFirst },
    } as never,
    {
      current: jest.fn(() => "LOCAL"),
    } as never,
  );

  beforeEach(() => jest.clearAllMocks());

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

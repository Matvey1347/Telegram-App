import { NotFoundException } from "@nestjs/common";
import { TelegramBotApplicationType } from "@prisma/client";
import { FinanceBrowserContextService } from "@consumer-finance/api/http/finance-browser-context.service";

describe("FinanceBrowserContextService", () => {
  const findFirst = jest.fn();
  const browserLoginBotUsername = jest.fn<string | null, []>(() => null);
  const publicUsername = jest.fn<string | null, [string, string]>();
  const service = new FinanceBrowserContextService(
    {
      telegramBotIntegration: { findFirst },
    } as never,
    {
      current: jest.fn(() => "LOCAL"),
      browserLoginBotUsername,
    } as never,
    { publicUsername } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    browserLoginBotUsername.mockReturnValue(null);
    publicUsername.mockReturnValue(null);
  });

  it("resolves the LOCAL bot by the same persisted username used for authentication", async () => {
    browserLoginBotUsername.mockReturnValue("finance_local_bot");
    findFirst.mockResolvedValue({ id: "selected", workspaceId: "workspace" });
    await expect(service.resolve()).resolves.toEqual({
      financeBotId: "selected",
    });
    expect(findFirst.mock.calls[0][0].where.runtimeInstances.some).toEqual({
      environment: "LOCAL",
      username: { equals: "finance_local_bot", mode: "insensitive" },
    });
  });

  it("returns the configured LOCAL Finance bot even when webhook delivery is disabled", async () => {
    findFirst.mockResolvedValue({
      id: "finance-bot-1",
      workspaceId: "workspace",
    });

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
      select: { id: true, workspaceId: true },
    });
  });

  it("adds only the configured Groshly support username for the selected workspace", async () => {
    findFirst.mockResolvedValue({
      id: "finance-bot",
      workspaceId: "dashboard",
    });
    publicUsername.mockReturnValue("groshly_help_bot");

    await expect(service.resolve()).resolves.toEqual({
      financeBotId: "finance-bot",
      supportBotUsername: "groshly_help_bot",
    });
    expect(publicUsername).toHaveBeenCalledWith("GROSHLY", "dashboard");
  });

  it("reports an actionable not-found error when Finance has not been configured", async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.resolve()).rejects.toThrow(NotFoundException);
  });
});

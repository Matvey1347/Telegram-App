import { describe, expect, it } from "vitest";
import {
  consumerFinanceAccountUrl,
  consumerFinanceInvestmentUrl,
  consumerFinanceScreenUrl,
  financeSurfaceForBootstrap,
  hasConsumerFinanceRegularPaymentTarget,
  readConsumerFinanceAccountId,
  readConsumerFinanceInvestmentId,
  readConsumerFinanceRegularPaymentTarget,
  readConsumerFinanceScreen,
} from "./consumer-finance-navigation";

function location(url: string) {
  return new URL(url) as unknown as Location;
}

describe("consumer Finance surface and browser navigation", () => {
  it("renders the web shell while launch detection is pending", () => {
    expect(financeSurfaceForBootstrap("browser")).toBe("browser");
    expect(financeSurfaceForBootstrap("ready")).toBe("telegram");
    expect(financeSurfaceForBootstrap("loading")).toBe("browser");
    expect(financeSurfaceForBootstrap("error")).toBe("telegram");
  });

  it.each([
    "reminders",
    "billing",
    "profile",
    "debts",
    "regular-payments",
    "savings",
    "investments",
  ] as const)("preserves the %s browser section in the URL", (screen) => {
    const source = location("https://finance.example/finance/bot");
    const path = consumerFinanceScreenUrl(source, screen);
    expect(path).toBe(`/finance/bot?screen=${screen}`);
    expect(
      readConsumerFinanceScreen(location(`https://finance.example${path}`)),
    ).toBe(screen);
  });

  it("round-trips create and existing account editor URLs", () => {
    const source = location(
      "https://finance.example/finance/bot?screen=accounts",
    );
    const editPath = consumerFinanceAccountUrl(source, "account-1");
    const createPath = consumerFinanceAccountUrl(source, "create");

    expect(editPath).toBe("/finance/bot?screen=account&accountId=account-1");
    expect(
      readConsumerFinanceScreen(location(`https://finance.example${editPath}`)),
    ).toBe("account");
    expect(
      readConsumerFinanceAccountId(
        location(`https://finance.example${editPath}`),
      ),
    ).toBe("account-1");
    expect(createPath).toBe("/finance/bot?screen=account&accountId=create");
  });

  it("round-trips an investment detail URL and rejects a missing id", () => {
    const source = location(
      "https://finance.example/finance/bot?screen=investments",
    );
    const path = consumerFinanceInvestmentUrl(source, "asset-1");
    expect(path).toBe("/finance/bot?screen=investment&investmentId=asset-1");
    expect(
      readConsumerFinanceInvestmentId(
        location(`https://finance.example${path}`),
      ),
    ).toBe("asset-1");
    const malformed = location(
      "https://finance.example/finance/bot?screen=investment",
    );
    expect(readConsumerFinanceScreen(malformed)).toBe("investments");
  });

  it("recovers a malformed account route without a blank editor", () => {
    const malformed = location(
      "https://finance.example/finance/bot?screen=account&accountId=%20",
    );

    expect(readConsumerFinanceScreen(malformed)).toBe("accounts");
    expect(readConsumerFinanceAccountId(malformed)).toBeNull();
  });

  it("keeps old Ultimate links working by opening consolidated Analytics", () => {
    expect(
      readConsumerFinanceScreen(
        location("https://finance.example/finance/bot?screen=ultimate"),
      ),
    ).toBe("analytics");
  });

  it("parses a complete regular-payment notification target", () => {
    const target = location(
      "https://finance.example/finance/bot?screen=regular-payments&regularPaymentId=rent&occurrenceAt=2026-09-08T08%3A00%3A00.000Z&configVersion=7",
    );

    expect(readConsumerFinanceRegularPaymentTarget(target)).toEqual({
      regularPaymentId: "rent",
      occurrenceAt: "2026-09-08T08:00:00.000Z",
      expectedVersion: 7,
    });
    expect(hasConsumerFinanceRegularPaymentTarget(target)).toBe(true);
  });

  it("rejects incomplete or invalid regular-payment targets recoverably", () => {
    const incomplete = location(
      "https://finance.example/finance/bot?screen=regular-payments&regularPaymentId=rent",
    );
    const invalidDate = location(
      "https://finance.example/finance/bot?screen=regular-payments&regularPaymentId=rent&occurrenceAt=nope",
    );
    const invalidCalendarDate = location(
      "https://finance.example/finance/bot?screen=regular-payments&regularPaymentId=rent&occurrenceAt=2026-02-31T08%3A00%3A00.000Z",
    );

    expect(readConsumerFinanceScreen(incomplete)).toBe("regular-payments");
    expect(readConsumerFinanceRegularPaymentTarget(incomplete)).toBeNull();
    expect(readConsumerFinanceRegularPaymentTarget(invalidDate)).toBeNull();
    expect(
      readConsumerFinanceRegularPaymentTarget(invalidCalendarDate),
    ).toBeNull();
    expect(hasConsumerFinanceRegularPaymentTarget(incomplete)).toBe(true);
  });
});

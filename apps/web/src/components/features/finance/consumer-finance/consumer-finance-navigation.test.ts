import { describe, expect, it } from "vitest";
import {
  consumerFinanceScreenUrl,
  financeSurfaceForBootstrap,
  readConsumerFinanceScreen,
} from "./consumer-finance-navigation";

function location(url: string) {
  return new URL(url) as unknown as Location;
}

describe("consumer Finance surface and browser navigation", () => {
  it("resolves only an ordinary browser launch to the Web App surface", () => {
    expect(financeSurfaceForBootstrap("browser")).toBe("browser");
    expect(financeSurfaceForBootstrap("ready")).toBe("telegram");
    expect(financeSurfaceForBootstrap("loading")).toBe("telegram");
    expect(financeSurfaceForBootstrap("error")).toBe("telegram");
  });

  it.each(["reminders", "billing"] as const)(
    "preserves the %s browser section in the URL",
    (screen) => {
      const source = location("https://finance.example/finance/bot");
      const path = consumerFinanceScreenUrl(source, screen);
      expect(path).toBe(`/finance/bot?screen=${screen}`);
      expect(
        readConsumerFinanceScreen(location(`https://finance.example${path}`)),
      ).toBe(screen);
    },
  );
});

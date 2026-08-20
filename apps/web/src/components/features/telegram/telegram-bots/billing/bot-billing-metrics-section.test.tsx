import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BillingMetrics,
  formatMinor,
} from "./bot-billing-metrics-section";

describe("BotBillingMetricsSection", () => {
  it("renders the generic owner metrics required by GREETER", () => {
    render(
      <BillingMetrics
        data={{
          registeredUsers: 120,
          freeUsers: 90,
          paidUsers: 30,
          activeSubscriptions: 24,
          canceled: 4,
          failedPayments: 2,
          monthly: 20,
          yearly: 4,
          mrr: [
            { currency: "USD", amountMinor: 12345 },
            { currency: "XTR", amountMinor: 200 },
          ],
          collectedRevenue: [{ currency: "USD", amountMinor: 54321 }],
        }}
      />,
    );
    expect(screen.getByText("Users")).toBeInTheDocument();
    expect(screen.getByText("Free users")).toBeInTheDocument();
    expect(screen.getByText("Paid users")).toBeInTheDocument();
    expect(screen.getByText("Canceled subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Failed payments")).toBeInTheDocument();
    expect(screen.getByText("200 XTR")).toBeInTheDocument();
  });

  it("formats fiat minor units and keeps Telegram Stars whole", () => {
    expect(formatMinor(12345, "USD")).toMatch(/123\.45/);
    expect(formatMinor(12345, "XTR")).toBe("12,345 XTR");
  });
});

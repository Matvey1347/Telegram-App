import { render, screen } from "@testing-library/react";
import type { MutualPromotionFolderListItem } from "@telegram-system/shared";
import { describe, expect, it } from "vitest";
import { MutualPromotionPaidSubscriberPrice } from "./mutual-promotion-paid-subscriber-price";

const channel = {
  role: "PAID",
  stats: { subscriberPrice: 9, currency: "UAH" },
  kpi: {
    currency: "UAH",
    targetFrom: null,
    targetTo: 9,
    acceptableFrom: null,
    acceptableTo: null,
    stopFrom: 12,
    stopTo: null,
  },
} as unknown as MutualPromotionFolderListItem["channels"][number];

describe("MutualPromotionPaidSubscriberPrice", () => {
  it("uses the configured KPI boundaries for target, ok and stop colors", () => {
    const { rerender } = render(
      <MutualPromotionPaidSubscriberPrice channel={channel} />,
    );
    expect(screen.getByText("9 UAH")).toHaveClass("text-emerald-300");

    rerender(
      <MutualPromotionPaidSubscriberPrice
        channel={{
          ...channel,
          stats: { ...channel.stats, subscriberPrice: 9.01 },
        }}
      />,
    );
    expect(screen.getByText("9.01 UAH")).toHaveClass("text-yellow-300");

    rerender(
      <MutualPromotionPaidSubscriberPrice
        channel={{
          ...channel,
          stats: { ...channel.stats, subscriberPrice: 12 },
        }}
      />,
    );
    expect(screen.getByText("12 UAH")).toHaveClass("text-rose-300");
  });
});

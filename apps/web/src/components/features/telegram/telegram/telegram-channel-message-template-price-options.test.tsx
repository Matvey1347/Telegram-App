import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TelegramChannelMessageTemplatePriceOptions } from "./telegram-channel-message-template-price-options";

describe("TelegramChannelMessageTemplatePriceOptions", () => {
  it("starts with every format selected and exposes rounding choices", async () => {
    const user = userEvent.setup();
    const onExcludedProductNamesChange = vi.fn();
    const onPriceRoundingChange = vi.fn();
    const onProductNameOverridesChange = vi.fn();
    const onBundleOfferEnabledChange = vi.fn();
    const onBundleDiscountPercentChange = vi.fn();
    const onBundleBasePriceOverridesChange = vi.fn();
    render(
      <TelegramChannelMessageTemplatePriceOptions
        productNames={["1/24", "3/72"]}
        excludedProductNames={[]}
        priceRounding="NONE"
        productNameOverrides={{ "No auto-delete": "Без видалення" }}
        bundleOfferEnabled={false}
        bundleDiscountPercent={10}
        bundleBasePriceOverrides={{}}
        onExcludedProductNamesChange={onExcludedProductNamesChange}
        onPriceRoundingChange={onPriceRoundingChange}
        onProductNameOverridesChange={onProductNameOverridesChange}
        onBundleOfferEnabledChange={onBundleOfferEnabledChange}
        onBundleDiscountPercentChange={onBundleDiscountPercentChange}
        onBundleBasePriceOverridesChange={onBundleBasePriceOverridesChange}
      />,
    );

    expect(screen.getByRole("checkbox", { name: "1/24" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "3/72" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "3/72" }));
    expect(onExcludedProductNamesChange).toHaveBeenCalledWith(["3/72"]);

    await user.click(screen.getByRole("button", { name: "Exact prices" }));
    await user.click(
      screen.getByRole("button", { name: "Round to nearest 10" }),
    );
    expect(onPriceRoundingChange).toHaveBeenCalledWith("NEAREST_10");

    fireEvent.change(screen.getByLabelText("Display name for 1/24"), {
      target: { value: "Добу" },
    });
    expect(onProductNameOverridesChange).toHaveBeenCalledWith({
      "1/24": "Добу",
      "No auto-delete": "Без видалення",
    });

    await user.click(screen.getByRole("checkbox", { name: "Add package offer" }));
    expect(onBundleOfferEnabledChange).toHaveBeenCalledWith(true);
  });
});

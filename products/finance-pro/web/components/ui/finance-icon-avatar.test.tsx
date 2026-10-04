import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceIconAvatar } from "./finance-icon-avatar";

describe("FinanceIconAvatar", () => {
  it("renders image avatars without the fallback background or border", () => {
    render(
      <FinanceIconAvatar
        label="adsell.io"
        icon={{
          type: "image",
          id: "adsell-avatar",
          url: "https://cdn.example.com/adsell.png",
        }}
      />,
    );

    expect(screen.getByRole("img", { name: "adsell.io" })).toHaveClass(
      "bg-transparent",
    );
    expect(screen.getByRole("img", { name: "adsell.io" })).not.toHaveClass(
      "bg-neutral-800",
      "border-neutral-700",
    );
  });
});

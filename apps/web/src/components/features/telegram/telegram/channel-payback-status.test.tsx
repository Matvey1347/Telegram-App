import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChannelPaybackStatus } from "./channel-payback-status";

describe("ChannelPaybackStatus", () => {
  it("uses the channel-card icon and color treatment", () => {
    const { container } = render(
      <ChannelPaybackStatus paybackPercent={2.5} adsLeft={105} />,
    );

    expect(screen.getByText("Payback")).toBeInTheDocument();
    expect(screen.getByText("2.5%")).toBeInTheDocument();
    expect(screen.getByText("105")).toBeInTheDocument();
    expect(container.querySelector(".lucide-percent")).toHaveClass(
      "text-teal-300",
    );
    expect(container.querySelector(".lucide-megaphone")).toHaveClass(
      "text-amber-300",
    );
  });

  it("can preserve the whole-percent presentation used on channel cards", () => {
    render(
      <ChannelPaybackStatus
        paybackPercent={27.1}
        paybackMaximumFractionDigits={0}
        adsLeft={13}
      />,
    );

    expect(screen.getByText("27%")).toBeInTheDocument();
  });
});

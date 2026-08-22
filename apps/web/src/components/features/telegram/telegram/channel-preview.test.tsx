import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChannelPreview } from "./channel-preview";

describe("ChannelPreview", () => {
  it("shows the view rate beside the subscriber count", () => {
    render(
      <ChannelPreview
        channel={{
          title: "Psychology",
          currentSubscribersCount: 11_695,
          preview: { audience: { viewRate: 6.5 } },
        }}
      />,
    );

    expect(screen.getByText("11 695")).toBeInTheDocument();
    expect(screen.getByLabelText("Subscribers")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("6.5%")).toBeInTheDocument();
  });

  it("does not show a zero view rate when audience data is missing", () => {
    render(
      <ChannelPreview
        channel={{ title: "New channel", currentSubscribersCount: 120 }}
      />,
    );

    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });
});

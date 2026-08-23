import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChannelPreview } from "./channel-preview";

describe("ChannelPreview", () => {
  it("shows the view and reaction rates beside the subscriber count", () => {
    render(
      <ChannelPreview
        channel={{
          title: "Psychology",
          currentSubscribersCount: 11_695,
          preview: { audience: { viewRate: 6.5, reactionRate: 2.4 } },
        }}
      />,
    );

    expect(screen.getByText("11 695")).toBeInTheDocument();
    expect(screen.getByLabelText("Subscribers")).toBeInTheDocument();
    expect(screen.getAllByText("/")).toHaveLength(2);
    expect(screen.getByText("6.5%")).toBeInTheDocument();
    expect(screen.getByLabelText("Reaction rate")).toBeInTheDocument();
    expect(screen.getByText("2.4%")).toBeInTheDocument();
  });

  it("does not show a zero view rate when audience data is missing", () => {
    render(
      <ChannelPreview
        channel={{ title: "New channel", currentSubscribersCount: 120 }}
      />,
    );

    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reaction rate")).not.toBeInTheDocument();
  });
});

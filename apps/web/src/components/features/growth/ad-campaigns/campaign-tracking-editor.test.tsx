import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampaignTrackingEditor } from "./campaign-tracking-editor";

describe("Campaign tracking editor", () => {
  it("summarizes automatic tracking as all channels and reports unconfigured destinations", () => {
    render(
      <CampaignTrackingEditor
        allChannels
        kinds={[{ kind: "BOT", label: "Bot", channels: [
          { id: "main", title: "Campaign channel", photoUrl: null, hasSystemLink: false },
          { id: "configured", title: "Configured destination", photoUrl: null, hasSystemLink: true },
          { id: "pending", title: "Unconfigured destination", photoUrl: null, hasSystemLink: false },
        ] }]}
        hasError={false}
        kind="BOT"
        channelId="main"
        selectedIds={[]}
        onKindChange={vi.fn()}
        onScopeChange={vi.fn()}
      />,
    );
    expect(screen.getByText("All channels · Bot")).toBeVisible();
    expect(screen.getByText("Channels awaiting a system link: 1")).toBeVisible();
    expect(screen.queryByText("Configured destination")).not.toBeInTheDocument();
    expect(screen.getByText("Unconfigured destination")).not.toBeVisible();
    expect(screen.getByText("Edit tracking")).toBeVisible();
  });
});

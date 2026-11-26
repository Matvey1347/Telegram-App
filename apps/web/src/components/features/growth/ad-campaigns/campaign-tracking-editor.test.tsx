import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CampaignTrackingEditor } from "./campaign-tracking-editor";

describe("Campaign tracking editor", () => {
  it("starts with all channels and selects a destination directly", () => {
    const onScopeChange = vi.fn();
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
        onScopeChange={onScopeChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Edit tracking/ }));
    expect(screen.queryByText(/awaiting a system link/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All channels" }));
    fireEvent.click(screen.getByRole("button", { name: "Configured destination" }));
    expect(onScopeChange).toHaveBeenCalledWith(false, ["configured"]);
  });
});

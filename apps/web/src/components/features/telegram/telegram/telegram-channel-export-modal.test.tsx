import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TelegramChannelExportModal } from "./telegram-channel-export-modal";

describe("TelegramChannelExportModal", () => {
  it("resolves the selected network into its channels before exporting", () => {
    const onSubmit = vi.fn();
    render(
      <TelegramChannelExportModal
        open
        channels={[
          { id: "channel-1", title: "First" },
          { id: "channel-2", title: "Second" },
        ] as never}
        networks={[
          {
            id: "network-1",
            name: "Main network",
            channels: [{ id: "channel-1" }, { id: "channel-2" }],
          },
        ] as never}
        defaultChannelIds={[]}
        isSubmitting={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Network" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose network" }));
    fireEvent.click(screen.getByRole("button", { name: /Main network/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(onSubmit).toHaveBeenCalledWith({
      channelIds: ["channel-1", "channel-2"],
      sections: ["channel_profile", "ads", "crm", "finance", "channel_stats", "channel_dynamics", "traffic_attribution"],
    });
  });

  it("lets the user exclude a data section from the workbook", () => {
    const onSubmit = vi.fn();
    render(
      <TelegramChannelExportModal
        open channels={[{ id: "channel-1", title: "First" }] as never}
        networks={[]} defaultChannelIds={["channel-1"]} isSubmitting={false}
        onClose={vi.fn()} onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Channel stats/ }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      sections: ["channel_profile", "ads", "crm", "finance", "channel_dynamics", "traffic_attribution"],
    }));
  });
});

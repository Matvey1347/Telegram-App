import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdSalesInventoryModal } from "./ad-sales-inventory-modal";

describe("AdSalesInventoryModal", () => {
  it("chooses inventory channels inside a modal and closes with Done", () => {
    const onChannelsChange = vi.fn();
    const onClose = vi.fn();

    render(
      <AdSalesInventoryModal
        open
        loading={false}
        error={null}
        selectionMode="channels"
        selectedNetworkId=""
        selectedChannelIds={[]}
        networks={[]}
        channels={[
          {
            id: "channel-1",
            title: "Mentor Self-development",
            photoUrl: null,
          } as never,
        ]}
        onClose={onClose}
        onSelectionModeChange={vi.fn()}
        onNetworkChange={vi.fn()}
        onChannelsChange={onChannelsChange}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Inventory" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose channels" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Mentor Self-development/ }),
    );
    expect(onChannelsChange).toHaveBeenCalledWith(["channel-1"]);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

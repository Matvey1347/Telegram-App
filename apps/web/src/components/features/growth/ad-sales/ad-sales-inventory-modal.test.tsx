import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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

  it("discloses the analytics limit and prevents a seventh channel", () => {
    const changes = vi.fn();
    const channels = Array.from({ length: 7 }, (_, index) => ({
      id: `channel-${index + 1}`,
      title: `Channel ${index + 1}`,
      photoUrl: null,
    })) as never;
    function Harness() {
      const [selected, setSelected] = useState<string[]>([]);
      return (
        <AdSalesInventoryModal
          open
          loading={false}
          error={null}
          selectionMode="channels"
          selectedNetworkId=""
          selectedChannelIds={selected}
          networks={[]}
          channels={channels}
          maxSelectedChannels={6}
          onClose={vi.fn()}
          onSelectionModeChange={vi.fn()}
          onNetworkChange={vi.fn()}
          onChannelsChange={(ids) => {
            changes(ids);
            setSelected(ids);
          }}
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Choose channels" }));
    for (let index = 1; index <= 7; index += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: new RegExp(`Channel ${index}$`) }),
      );
    }

    expect(changes).toHaveBeenCalledTimes(6);
    expect(changes.mock.calls.at(-1)?.[0]).toHaveLength(6);
    expect(screen.getByText(/Analytics supports up to 6 channels/)).toBeTruthy();
  });
});

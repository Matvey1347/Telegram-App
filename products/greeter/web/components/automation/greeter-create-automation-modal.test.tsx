import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GreeterChannelView } from "@telegram-system/shared";
import { describe, expect, it, vi } from "vitest";
import { CreateGreeterAutomationModal } from "./greeter-create-automation-modal";

describe("CreateGreeterAutomationModal", () => {
  it("creates a channel-scoped automation only after a channel is selected", async () => {
    const onCreate = vi.fn();
    const channel = {
      channel: { id: "channel-1", title: "Product", username: "product" },
    } as GreeterChannelView;
    render(
      <CreateGreeterAutomationModal
        open
        saving={false}
        channels={[channel]}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );
    await userEvent.type(screen.getByRole("textbox"), "Welcome");
    await userEvent.click(
      screen.getByRole("button", { name: "Global automation" }),
    );
    await userEvent.click(screen.getByText("Channel-specific automation"));
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Select channel" }));
    await userEvent.click(screen.getByText("Product"));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith("Welcome", "AFTER_START", "channel-1");
  });
});

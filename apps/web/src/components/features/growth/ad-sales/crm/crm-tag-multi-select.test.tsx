import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CrmTagSummary } from "@telegram-system/shared";
import { CrmTagMultiSelect } from "./crm-tag-multi-select";

const tag = (id: string, systemKey: string | null): CrmTagSummary => ({
  id,
  name: id,
  color: "#22c55e",
  systemKey,
  isSystem: systemKey !== null,
  assignmentMode: systemKey ? "AUTOMATIC" : "MANUAL",
});

describe("CrmTagMultiSelect", () => {
  it("shows contact tags in their color and excludes channel and network tags", async () => {
    const onChange = vi.fn();
    render(
      <CrmTagMultiSelect
        tags={[
          tag("Clients", null),
          tag("Channel", "CHANNEL:channel-1"),
          tag("Network", "NETWORK:network-1"),
        ]}
        value={["Clients"]}
        onChange={onChange}
      />,
    );

    const selected = screen.getByText("Clients");
    expect(selected.parentElement?.getAttribute("style")).toContain("background-color: rgba(34, 197, 94, 0.133)");
    await userEvent.click(screen.getByRole("button", { name: /Clients/ }));
    const labels = screen.getAllByText("Clients");
    expect(labels).toHaveLength(2);
    expect(labels[1].getAttribute("style")).toContain("background-color: rgba(34, 197, 94, 0.133)");
    expect(screen.queryByText("Channel")).toBeNull();
    expect(screen.queryByText("Network")).toBeNull();
  });
});

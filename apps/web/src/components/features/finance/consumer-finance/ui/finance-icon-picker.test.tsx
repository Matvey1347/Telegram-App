import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconPicker } from "./finance-icon-picker";

const api = vi.hoisted(() => ({
  customIcons: vi.fn(),
  uploadCustomIcon: vi.fn(),
  saveCustomIcon: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-ledger-api", () => ({
  consumerFinanceLedgerApi: api,
}));

function renderPicker(onChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <div data-finance-modal="true" className="overflow-hidden">
        <IconPicker botId="bot" source="🏷️" onChange={onChange} />
      </div>
    </QueryClientProvider>,
  );
  return onChange;
}

describe("Finance IconPicker", () => {
  it("renders its panel in a viewport overlay instead of the clipped modal", async () => {
    api.customIcons.mockResolvedValue([]);
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Change icon" }));

    await screen.findByText("Saved images");
    const panel = document.querySelector("[data-finance-icon-picker-panel]");
    expect(panel?.parentElement).toBe(document.body);
    expect(panel).toHaveStyle({ position: "fixed" });
  });

  it("uses a named saved image as an immutable Finance image source", async () => {
    api.customIcons.mockResolvedValue([
      {
        id: "saved",
        name: "My receipt",
        imageUrl: "https://cdn.test/receipt.png",
      },
    ]);
    const onChange = renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "Change icon" }));
    fireEvent.click(await screen.findByRole("button", { name: "My receipt" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        "image:https://cdn.test/receipt.png",
      ),
    );
  });
});

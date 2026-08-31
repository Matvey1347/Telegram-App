import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdSaleClientField,
  canonicalTelegramUsername,
} from "./ad-sale-client-field";

describe("AdSaleClientField", () => {
  it("canonicalizes Telegram usernames with and without @ identically", () => {
    expect(canonicalTelegramUsername("Buyer_Name")).toBe("@buyer_name");
    expect(canonicalTelegramUsername("@@Buyer_Name")).toBe("@buyer_name");
    expect(canonicalTelegramUsername("bad name")).toBe("");
  });

  it("loads one bounded client list and renders avatar-backed options", async () => {
    const search = vi.fn().mockResolvedValue([
      {
        id: "client-1",
        displayName: "Buyer",
        telegramUsername: "@buyer",
        totalSalesCount: 2,
      },
    ]);
    const select = vi.fn();
    render(
      <AdSaleClientField
        contact=""
        selectedAdvertiserId={null}
        onContactChange={vi.fn()}
        onTelegramChange={vi.fn()}
        onSelect={select}
        onSearchAdvertisers={search}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Existing client" }));
    await waitFor(() => expect(search).toHaveBeenCalledWith(""));
    fireEvent.click(
      await screen.findByRole("button", { name: "Select client" }),
    );
    const option = await screen.findByRole("button", { name: /Buyer/ });
    expect(option.querySelector("img")?.getAttribute("src")).toContain(
      "/buyer.jpg",
    );
    fireEvent.click(option);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ id: "client-1" }),
    );
  });

  it("searches existing clients on the server and follows an externally restored selection", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue([]);
    const { rerender } = render(
      <AdSaleClientField
        contact=""
        selectedAdvertiserId={null}
        onContactChange={vi.fn()}
        onTelegramChange={vi.fn()}
        onSelect={vi.fn()}
        onSearchAdvertisers={search}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Existing client" }));
    fireEvent.change(screen.getByLabelText("Search existing clients"), {
      target: { value: "Acme" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(search).toHaveBeenCalledWith("Acme");
    fireEvent.click(screen.getByRole("button", { name: "New client" }));
    rerender(
      <AdSaleClientField
        contact="@restored"
        selectedAdvertiserId="restored-id"
        onContactChange={vi.fn()}
        onTelegramChange={vi.fn()}
        onSelect={vi.fn()}
        onSearchAdvertisers={search}
      />,
    );
    await act(async () => Promise.resolve());
    expect(
      screen.getByRole("button", { name: "Existing client" }),
    ).toHaveAttribute("aria-pressed", "true");
    rerender(
      <AdSaleClientField
        contact=""
        selectedAdvertiserId={null}
        onContactChange={vi.fn()}
        onTelegramChange={vi.fn()}
        onSelect={vi.fn()}
        onSearchAdvertisers={search}
      />,
    );
    await act(async () => Promise.resolve());
    expect(screen.getByRole("button", { name: "New client" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    vi.useRealTimers();
  });
});

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AdSaleClientField,
  canonicalTelegramUsername,
} from "./ad-sale-client-field";

describe("AdSaleClientField", () => {
  it("keeps the label and client mode control in one header row", () => {
    render(
      <AdSaleClientField
        contact=""
        selectedAdvertiserId={null}
        onContactChange={vi.fn()}
        onTelegramChange={vi.fn()}
        onSelect={vi.fn()}
        onSearchAdvertisers={vi.fn().mockResolvedValue([])}
      />,
    );

    const header = screen.getByText("Client").parentElement;
    expect(header).toHaveClass("flex", "h-7", "items-center", "gap-2");
    expect(header).toContainElement(
      screen.getByRole("button", { name: "New client" }),
    );
    expect(screen.getByLabelText("Telegram username")).toHaveClass("h-[42px]");
  });

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
    expect(
      screen.queryByLabelText("Search existing clients"),
    ).not.toBeInTheDocument();
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

  it("uses the select's built-in search when the client list is large", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue(
      Array.from({ length: 6 }, (_, index) => ({
        id: `client-${index + 1}`,
        displayName: `Client ${index + 1}`,
        telegramUsername: `@client_${index + 1}`,
        totalSalesCount: index,
      })),
    );
    render(
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith("");

    fireEvent.click(screen.getByRole("button", { name: "Select client" }));
    const selectSearch = screen.getByPlaceholderText("Search…");
    fireEvent.change(selectSearch, { target: { value: "Client 6" } });
    expect(screen.getByRole("button", { name: /Client 6/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Client 1/ })).toBeNull();
    expect(search).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("follows an externally restored client selection", async () => {
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
  });
});

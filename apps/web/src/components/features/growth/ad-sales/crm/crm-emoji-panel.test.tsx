import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CrmEmojiPanel } from "./crm-emoji-panel";

vi.mock("@/lib/api", () => ({ telegramChannelsApi: { customEmojiPacks: vi.fn().mockRejectedValue(new Error("offline")) } }));

describe("CRM emoji panel", () => {
  it("inserts emojis without dismissing the panel, and closes on Escape", async () => {
    const insert = vi.fn();
    const close = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CrmEmojiPanel onInsert={insert} onClose={close} /></QueryClientProvider>);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search emoji" }), "smile");
    const button = screen.getAllByRole("button", { name: /Insert.*smil/i })[0];
    await userEvent.click(button);
    expect(insert).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Emoji picker" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });
  it("explains a Premium loading failure", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CrmEmojiPanel onInsert={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Premium" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load Premium emoji");
  });
});

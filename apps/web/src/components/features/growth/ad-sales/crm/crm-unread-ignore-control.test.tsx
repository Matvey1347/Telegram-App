import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCrmUnreadIgnored } from "@/lib/features/growth/crm-inbox-api";
import { CrmUnreadIgnoreControl } from "./crm-unread-ignore-control";
vi.mock("@/lib/features/growth/crm-inbox-api", () => ({ setCrmUnreadIgnored: vi.fn() }));
const view = (ignored: boolean) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CrmUnreadIgnoreControl id="chat" ignored={ignored} /></QueryClientProvider>);
beforeEach(() => vi.resetAllMocks());
describe("Unread exclusion control", () => {
  it("ignores a chat and offers reversal for an ignored chat", async () => {
    vi.mocked(setCrmUnreadIgnored).mockResolvedValue({ id: "chat", ignoreInUnread: true });
    const rendered = view(false);
    fireEvent.click(screen.getByRole("button", { name: "Ignore in Unread" }));
    await waitFor(() => expect(setCrmUnreadIgnored).toHaveBeenCalledWith("chat", true));
    rendered.unmount();
    view(true);
    fireEvent.click(screen.getByRole("button", { name: "Show in Unread" }));
    await waitFor(() => expect(setCrmUnreadIgnored).toHaveBeenCalledWith("chat", false));
  });
  it("shows an error without claiming success", async () => {
    vi.mocked(setCrmUnreadIgnored).mockRejectedValue(new Error("offline"));
    view(false);
    fireEvent.click(screen.getByRole("button", { name: "Ignore in Unread" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update");
    expect(screen.getByRole("button", { name: "Ignore in Unread" })).toBeEnabled();
  });
  it("exposes the compact bell state and describes the Unread action", () => {
    const client = new QueryClient();
    const rendered = render(<QueryClientProvider client={client}><CrmUnreadIgnoreControl id="chat" ignored={false} compact /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Ignore in Unread" })).toHaveAttribute("title", "Hide this chat from Unread");
    expect(screen.getByRole("button", { name: "Ignore in Unread" })).toHaveAttribute("aria-pressed", "false");
    rendered.rerender(<QueryClientProvider client={client}><CrmUnreadIgnoreControl id="chat" ignored compact /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Show in Unread" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show in Unread" })).toHaveAttribute("title", "Show this chat in Unread");
  });
});

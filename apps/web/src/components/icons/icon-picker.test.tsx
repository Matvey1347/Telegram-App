import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IconPicker } from "./icon-picker";

const getIcon = vi.fn().mockResolvedValue({
  id: "saved-icon",
  type: "emoji",
  name: "Handshake",
  emoji: "🤝",
});

vi.mock("@/lib/api", () => ({
  iconsApi: {
    get: (...args: unknown[]) => getIcon(...args),
  },
}));

describe("IconPicker", () => {
  it("resolves and displays a persisted icon id before opening the picker", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <IconPicker compact iconId="saved-icon" onChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("🤝")).toBeInTheDocument();
    expect(getIcon).toHaveBeenCalledWith("saved-icon");
  });
});

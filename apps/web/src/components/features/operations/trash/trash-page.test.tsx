import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trashApi } from "@/lib/api";
import { TrashPage } from "./trash-page";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({
  trashApi: { list: vi.fn(), restore: vi.fn() },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ startOperation: vi.fn() }),
}));

const listMock = vi.mocked(trashApi.list);

beforeEach(() => listMock.mockReset());

describe("TrashPage", () => {
  it("reuses a recent in-memory page when returning to Trash", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ["trash", 1, 25],
      {
        items: [
          {
            id: "item-1",
            kind: "account",
            name: "Archived account",
            product: "Internal Finance",
            deletedAt: "2026-11-01T00:00:00.000Z",
            expiresAt: "2027-01-30T00:00:00.000Z",
            daysRemaining: 88,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
      { updatedAt: Date.now() - 2 * 60_000 },
    );

    render(
      <QueryClientProvider client={client}>
        <TrashPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Archived account")).toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });
});

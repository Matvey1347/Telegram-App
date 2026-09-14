import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancePortabilityHistory } from "./finance-portability-history";

const api = vi.hoisted(() => ({
  portabilityHistory: vi.fn(),
  rollbackImport: vi.fn(),
}));
vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: api,
}));

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <FinancePortabilityHistory botId="bot-1" locale="en" />
      </QueryClientProvider>,
    ),
  };
}

describe("FinancePortabilityHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows both import and export history and rolls an import back after confirmation", async () => {
    api.portabilityHistory.mockResolvedValue({
      items: [
        {
          id: "export-1",
          operation: "EXPORT",
          mode: null,
          sourceFileName: null,
          recordCount: 8,
          counts: { transactions: 8 },
          createdAt: "2026-09-14T13:00:00.000Z",
          canRollback: false,
          rolledBackAt: null,
          rollbackOfId: null,
        },
        {
          id: "import-1",
          operation: "IMPORT",
          mode: "REPLACE",
          sourceFileName: "backup.json",
          recordCount: 5,
          counts: { transactions: 5 },
          createdAt: "2026-09-14T12:00:00.000Z",
          canRollback: true,
          rolledBackAt: null,
          rollbackOfId: null,
        },
      ],
    });
    api.rollbackImport.mockResolvedValue({
      importId: "rollback-1",
      restoredFromImportId: "import-1",
      duplicate: false,
      imported: 1,
      counts: {},
      warnings: [],
    });
    const { client } = renderHistory();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(await screen.findByText("Export")).toBeInTheDocument();
    expect(screen.getByText(/8 records/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Import · Replace all · backup.json/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Roll back import" }));
    fireEvent.change(screen.getByPlaceholderText("ROLLBACK"), {
      target: { value: "ROLLBACK" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Roll back import" })[1],
    );

    await waitFor(() =>
      expect(api.rollbackImport).toHaveBeenCalledWith("bot-1", "import-1"),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["consumer-finance", "bot-1"],
    });
    expect(
      await screen.findByText("Finance data was restored."),
    ).toBeInTheDocument();
  });

  it("offers retry after a history load failure", async () => {
    api.portabilityHistory
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [] });
    renderHistory();

    expect(
      await screen.findByText("Could not load history."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("No imports or exports yet."),
    ).toBeInTheDocument();
  });
});

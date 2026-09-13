import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceImportModal } from "./finance-import-modal";

const portability = vi.hoisted(() => ({ importData: vi.fn() }));
vi.mock("@/lib/features/finance/consumer-finance-portability-api", () => ({
  CONSUMER_FINANCE_IMPORT_MAX_BYTES: 10 * 1024 * 1024,
  importConsumerFinanceData: portability.importData,
}));

function renderModal(locale: "en" | "uk" | "ru" = "ru") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <FinanceImportModal
        open
        botId="bot-1"
        locale={locale}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

function importFile() {
  const contents = JSON.stringify({
    format: "telegram-system.consumer-finance",
    version: 1,
    mode: "ADD",
    data: {
      accounts: [{ ref: "cash", name: "Cash", type: "CASH", currency: "UAH" }],
    },
  });
  const file = new File([contents], "finance.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", {
    value: vi.fn().mockResolvedValue(contents),
  });
  return file;
}

describe("FinanceImportModal", () => {
  beforeEach(() => {
    portability.importData.mockReset();
  });

  it("copies the complete localized format instruction with one click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderModal("ru");

    fireEvent.click(
      screen.getByRole("button", { name: "Скопировать инструкцию" }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const instruction = String(writeText.mock.calls[0]?.[0]);
    expect(instruction).toContain("ОБЩИЕ ПРАВИЛА");
    expect(instruction).toContain("regularPayments");
    expect(instruction).toContain("investmentValuations");
    expect(instruction).toContain('"mode": "ADD"');
  });

  it("streams localized progress, completes and invalidates Finance reads", async () => {
    portability.importData.mockImplementation(
      async (input?: { onProgress: (...args: unknown[]) => void }) => {
        input?.onProgress(
          {
            phase: "IMPORTING",
            section: "transactions",
            processed: 2,
            total: 2,
          },
          4,
          15,
        );
        return {
          importId: "import-1",
          duplicate: false,
          imported: 2,
          counts: { transactions: 2 },
          warnings: [],
        };
      },
    );
    const { client, container } = renderModal("ru");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [importFile()] } });
    await screen.findByText("finance.json");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Начать импорт" }));

    expect(portability.importData).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: "bot-1",
        file: expect.any(File),
        mode: "ADD",
      }),
    );
    expect(
      await screen.findByText("Добавляем данные · Операции"),
    ).toBeVisible();
    expect(await screen.findByText("Импортировано записей: 2")).toBeVisible();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["consumer-finance", "bot-1"],
    });
  });

  it("requires destructive confirmation and imports in replace mode", async () => {
    portability.importData.mockResolvedValue({
      importId: "replacement",
      duplicate: false,
      imported: 1,
      counts: { accounts: 1 },
      warnings: [],
    });
    const { container } = renderModal("en");
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [importFile()] } });
    await screen.findByText("finance.json");
    fireEvent.click(screen.getByRole("radio", { name: "Replace all" }));
    expect(screen.getByRole("button", { name: "Start import" })).toBeDisabled();
    expect(
      screen.getByText(/current Finance records will be permanently deleted/i),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start import" }));

    await waitFor(() =>
      expect(portability.importData).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "REPLACE" }),
      ),
    );
  });

  it("rejects a malformed file before making a network request", async () => {
    const { container } = renderModal("en");
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["not-json"], "finance.json", {
      type: "application/json",
    });
    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue("not-json"),
    });

    fireEvent.change(input, { target: { files: [file] } });

    expect(
      await screen.findByText(
        "Choose a valid JSON file in the documented format.",
      ),
    ).toBeVisible();
    expect(portability.importData).not.toHaveBeenCalled();
  });

  it("aborts an active import and clears the stale progress state", async () => {
    portability.importData.mockImplementation(
      (input?: {
        signal: AbortSignal;
        onProgress: (
          progress: {
            phase: "IMPORTING";
            section: "transactions";
            processed: number;
            total: number;
          },
          current: number,
          total: number,
        ) => void;
      }) =>
        new Promise((_resolve, reject) => {
          if (!input) return;
          const { signal, onProgress } = input;
          onProgress(
            {
              phase: "IMPORTING",
              section: "transactions",
              processed: 1,
              total: 2,
            },
            4,
            15,
          );
          signal.addEventListener("abort", () => {
            const error = new Error("cancelled");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const { container } = renderModal("en");
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [importFile()] } });
    await screen.findByText("finance.json");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start import" }));
    expect(await screen.findByText("Adding data · Transactions")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Cancel import" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Adding data · Transactions"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Start import" })).toBeEnabled();
  });
});

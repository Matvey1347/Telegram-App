import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumerFinanceCategory } from "@telegram-system/shared";
import { FinanceCategories } from "./finance-categories";

const apiMocks = vi.hoisted(() => ({
  categories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  archiveCategory: vi.fn(),
}));

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: apiMocks,
}));

const category: ConsumerFinanceCategory = {
  id: "category-1",
  name: "Coffee",
  iconPresentation: { type: "unicode", value: "☕" },
  type: "EXPENSE",
  parentId: null,
  archivedAt: null,
};

function renderCategories() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FinanceCategories botId="bot" locale="en" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.categories.mockResolvedValue([category]);
});

describe("FinanceCategories CRUD", () => {
  it("lists and creates a category through the API", async () => {
    apiMocks.createCategory.mockResolvedValue({ ...category, id: "new" });
    renderCategories();

    expect(await screen.findByText("Coffee")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Dining" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.createCategory).toHaveBeenCalledOnce());
    expect(apiMocks.createCategory).toHaveBeenCalledWith("bot", {
      name: "Dining",
      emoji: "🏷️",
      type: "EXPENSE",
      parentId: undefined,
    });
  });

  it("updates an existing category", async () => {
    apiMocks.updateCategory.mockResolvedValue({ ...category, name: "Cafe" });
    renderCategories();

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit category: Coffee" }),
    );
    fireEvent.change(screen.getByDisplayValue("Coffee"), {
      target: { value: "Cafe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiMocks.updateCategory).toHaveBeenCalledOnce());
    expect(apiMocks.updateCategory).toHaveBeenCalledWith("bot", "category-1", {
      name: "Cafe",
      emoji: "☕",
      type: "EXPENSE",
      parentId: null,
    });
  });

  it("archives only after typed confirmation", async () => {
    apiMocks.archiveCategory.mockResolvedValue({
      ...category,
      archivedAt: "2026-08-21T00:00:00.000Z",
    });
    renderCategories();

    fireEvent.click(
      await screen.findByRole("button", { name: "Archive category: Coffee" }),
    );
    fireEvent.change(screen.getByPlaceholderText("Coffee"), {
      target: { value: "Coffee" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() =>
      expect(apiMocks.archiveCategory).toHaveBeenCalledOnce(),
    );
    expect(apiMocks.archiveCategory).toHaveBeenCalledWith("bot", "category-1");
  });
});

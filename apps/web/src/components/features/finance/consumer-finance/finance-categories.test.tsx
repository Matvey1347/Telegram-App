import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

function renderCategories(locale: "en" | "uk" = "en") {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FinanceCategories botId="bot" locale={locale} />
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

  it("uses the shared localized icon picker with a populated emoji grid", async () => {
    renderCategories("uk");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Редагувати категорію: Coffee",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Змінити емодзі" }));

    expect(
      await screen.findByRole("button", { name: "Люди" }),
    ).toBeInTheDocument();
    expect(await screen.findByTitle("alien")).toHaveTextContent("👽");
    expect(screen.queryByText("People")).not.toBeInTheDocument();
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

  it("nests multilevel children inside their parent container exactly once", async () => {
    apiMocks.categories.mockResolvedValue([
      category,
      { ...category, id: "child", name: "Cafe", parentId: category.id },
      { ...category, id: "grandchild", name: "Latte", parentId: "child" },
    ]);
    const { container } = renderCategories();

    await screen.findByText("Latte");
    const parent = container.querySelector('[data-category-id="category-1"]')!;
    const child = parent.querySelector('[data-category-id="child"]')!;
    expect(child).toBeInTheDocument();
    expect(
      child.querySelector('[data-category-id="grandchild"]'),
    ).toBeInTheDocument();
    expect(
      child.querySelector('[data-category-connector="child"]'),
    ).toBeInTheDocument();
    expect(
      child.querySelector('[data-category-connector="grandchild"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-category-id="child"]'),
    ).toHaveLength(1);
    expect(apiMocks.categories).toHaveBeenCalledOnce();
  });

  it("shows orphan and cyclic rows once in the legacy block", async () => {
    apiMocks.categories.mockResolvedValue([
      { ...category, id: "orphan", name: "Orphan", parentId: "missing" },
      { ...category, id: "cycle-a", name: "Cycle A", parentId: "cycle-b" },
      { ...category, id: "cycle-b", name: "Cycle B", parentId: "cycle-a" },
    ]);
    const { container } = renderCategories();

    const legacy = await screen.findByRole("region", {
      name: "Legacy categories",
    });
    expect(within(legacy).getByText("Orphan")).toBeInTheDocument();
    expect(within(legacy).getByText("Cycle A")).toBeInTheDocument();
    expect(within(legacy).getByText("Cycle B")).toBeInTheDocument();
    for (const id of ["orphan", "cycle-a", "cycle-b"]) {
      expect(
        container.querySelectorAll(`[data-category-id="${id}"]`),
      ).toHaveLength(1);
    }
  });

  it("keeps archived rows separate from the active hierarchy", async () => {
    apiMocks.categories.mockResolvedValue([
      category,
      {
        ...category,
        id: "archived",
        name: "Old category",
        archivedAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    const { container } = renderCategories();

    expect(await screen.findByText("Old category")).toBeInTheDocument();
    expect(
      container.querySelector('[data-archived-category-id="archived"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-category-id="archived"]'),
    ).not.toBeInTheDocument();
  });

  it("excludes self and descendants from the editable parent relationship", async () => {
    apiMocks.categories.mockResolvedValue([
      category,
      { ...category, id: "child", name: "Cafe", parentId: category.id },
      { ...category, id: "grandchild", name: "Latte", parentId: "child" },
      { ...category, id: "other", name: "Groceries", parentId: null },
    ]);
    renderCategories();

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit category: Coffee" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "No parent category" }),
    );

    expect(
      within(dialog).queryByRole("option", { name: "Coffee" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: "Cafe" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("option", { name: "Latte" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("option", { name: "Groceries" }),
    ).toBeInTheDocument();
    expect(apiMocks.categories).toHaveBeenCalledOnce();
  });
});

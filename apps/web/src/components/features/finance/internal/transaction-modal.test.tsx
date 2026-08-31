import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransactionCategory } from "@/lib/api";
import { telegramChannelsApi, transactionCategoriesApi } from "@/lib/api";
import {
  InternalTransactionModal,
  transactionCategoryPurpose,
} from "./transaction-modal";

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => null,
}));

const categories: TransactionCategory[] = [
  {
    id: "investment",
    name: "Investment",
    type: "income",
    isSystem: true,
    key: null,
  },
  {
    id: "revenue",
    name: "Channel Advertising Revenue",
    type: "income",
    isSystem: true,
    key: "channel_advertising_revenue",
  },
  {
    id: "buy-channels",
    name: "Buy Channels",
    type: "expense",
    isSystem: true,
    key: "buy_channels",
  },
  {
    id: "operations",
    name: "Operations",
    type: "expense",
    isSystem: false,
    key: null,
  },
  {
    id: "salary",
    name: "Salaries",
    type: "expense",
    isSystem: true,
    key: "salary",
  },
];

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InternalTransactionModal
        open
        title="Create Transaction"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        accounts={[
          {
            id: "account",
            name: "Main",
            currency: "USD",
            initialBalance: 0,
            isActive: true,
            assignedMemberId: "member",
          },
        ]}
        members={[
          {
            id: "member",
            workspaceId: "workspace",
            userId: "user",
            role: "member",
            isCurrentUser: false,
            user: { id: "user", email: "member@example.com", name: "Member" },
          },
        ]}
      />
    </QueryClientProvider>,
  );
}

function transactionDialog() {
  return screen.getByRole("dialog");
}

function primaryFieldLabels() {
  const fields = screen.getByTestId("transaction-primary-fields");
  return Array.from(fields.querySelectorAll("[data-transaction-field]")).map(
    (field) => field.querySelector("span")?.textContent?.replace("*", "") ?? "",
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("internal transaction modal category fields", () => {
  it("uses the standard compact modal width", () => {
    vi.spyOn(transactionCategoriesApi, "list").mockResolvedValue([]);
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([]);
    renderModal();

    expect(transactionDialog()).toHaveClass("max-w-[400px]");
    expect(transactionDialog()).not.toHaveClass("max-w-[1280px]");
  });

  it("recognizes legacy system category names when the API key is absent", () => {
    expect(transactionCategoryPurpose(categories[0])).toBe("investment");
    expect(
      transactionCategoryPurpose({
        ...categories[2],
        key: null,
        name: "Buy Channels (legacy)",
      }),
    ).toBe("buy-channels");
    expect(transactionCategoryPurpose(categories[3])).toBe("standard");
  });

  it("pairs Category with Member and Account with Amount for Investment", async () => {
    vi.spyOn(transactionCategoriesApi, "list").mockImplementation(
      async (type) => categories.filter((category) => category.type === type),
    );
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([]);
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByRole("button", { name: "Expense" }));
    await user.click(await screen.findByRole("button", { name: "Income" }));
    await waitFor(() =>
      expect(transactionCategoriesApi.list).toHaveBeenCalledWith("income"),
    );
    await user.click(screen.getByRole("button", { name: "Select category" }));
    await user.click(await screen.findByRole("button", { name: /Investment/ }));

    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(primaryFieldLabels()).toEqual([
      "Type",
      "Category",
      "Member",
      "Account",
      "Amount",
    ]);
    expect(screen.getByTestId("transaction-primary-fields")).toHaveClass(
      "md:grid-cols-2",
    );
    expect(
      screen
        .getByTestId("transaction-primary-fields")
        .querySelector('[data-transaction-field="type"]'),
    ).toHaveClass("md:col-span-2");
  });

  it("shows Channel for Buy Channels before Account and hides it for a standard category", async () => {
    vi.spyOn(transactionCategoriesApi, "list").mockImplementation(
      async (type) => categories.filter((category) => category.type === type),
    );
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([
      {
        id: "channel",
        title: "Business Patterns",
        isActive: true,
        canPostMessages: true,
        publishingCapabilities: {} as never,
      },
    ]);
    const user = userEvent.setup();
    renderModal();

    await waitFor(() =>
      expect(transactionCategoriesApi.list).toHaveBeenCalledWith("expense"),
    );
    await user.click(screen.getByRole("button", { name: "Select category" }));
    await user.click(
      await screen.findByRole("button", { name: /Buy Channels/ }),
    );
    expect(primaryFieldLabels()).toEqual([
      "Type",
      "Category",
      "Channel",
      "Account",
      "Amount",
    ]);
    expect(
      within(screen.getByTestId("transaction-primary-fields")).getByText(
        "Channel",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Buy Channels/ }));
    await user.click(await screen.findByRole("button", { name: /Operations/ }));
    await waitFor(() =>
      expect(primaryFieldLabels()).toEqual([
        "Type",
        "Category",
        "Account",
        "Amount",
      ]),
    );
    expect(
      screen
        .getByTestId("transaction-primary-fields")
        .querySelector('[data-transaction-field="type"]'),
    ).not.toHaveClass("md:col-span-2");
  });

  it("requires the member for the Salaries system expense", async () => {
    vi.spyOn(transactionCategoriesApi, "list").mockImplementation(
      async (type) => categories.filter((category) => category.type === type),
    );
    vi.spyOn(telegramChannelsApi, "select").mockResolvedValue([]);
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Select category" }));
    await user.click(await screen.findByRole("button", { name: /Salaries/ }));
    expect(transactionCategoryPurpose(categories.at(-1))).toBe("salary");
    expect(
      within(screen.getByTestId("transaction-primary-fields")).getByText(
        "Member",
      ),
    ).toBeInTheDocument();
  });
});

import type { AxiosInstance } from "axios";
import { describe, expect, it, vi } from "vitest";
import { createFinanceApi } from "./finance-api";

describe("finance account catalog loading", () => {
  it("collects all account pages with the API's maximum page size", async () => {
    const getAllPaginatedItems = vi.fn().mockResolvedValue([]);
    const financeApi = createFinanceApi({
      api: {} as AxiosInstance,
      getPaginated: vi.fn(),
      getAllPaginatedItems,
      hasExplicitPagination: vi.fn(),
      quietCrud: (() => ({
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      })) as never,
      quietMutationConfig: {},
    });

    await expect(financeApi.accountsApi.list()).resolves.toEqual([]);
    expect(getAllPaginatedItems).toHaveBeenCalledWith("/accounts", {
      pageSize: 100,
    });
  });
});

describe("internal Finance overview categories", () => {
  it("loads both category types in one request", async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const financeApi = createFinanceApi({
      api: { get } as unknown as AxiosInstance,
      getPaginated: vi.fn(),
      getAllPaginatedItems: vi.fn(),
      hasExplicitPagination: vi.fn(),
      quietCrud: (() => ({
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      })) as never,
      quietMutationConfig: {},
    });

    await expect(
      financeApi.transactionCategoriesApi.listAll(),
    ).resolves.toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/finance/categories");
  });
});

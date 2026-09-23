import { describe, expect, it, vi } from "vitest";

const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ api: { get } }));

import { telegramCrmApi } from "./telegram-crm-api";

describe("telegramCrmApi", () => {
  it("serializes selected CRM tag IDs without bracketed query keys", async () => {
    get.mockResolvedValue({ data: { items: [], totalItems: 0 } });

    await telegramCrmApi.listContacts({ tagIds: ["tag-1", "tag-2"] });

    expect(get).toHaveBeenCalledWith("/telegram-crm/contacts", {
      params: { tagIds: ["tag-1", "tag-2"] },
      paramsSerializer: { indexes: null },
      signal: undefined,
    });
  });
});

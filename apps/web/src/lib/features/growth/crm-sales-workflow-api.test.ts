import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { crmSalesWorkflowApi } from "./crm-sales-workflow-api";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.get).mockResolvedValue({ data: {} }); vi.mocked(api.patch).mockResolvedValue({ data: {} }); vi.mocked(api.post).mockResolvedValue({ data: {} }); });
describe("CRM sales workflow API", () => {
  it("uses exact conversation command routes and explicit task actions", async () => {
    await crmSalesWorkflowApi.setStatus("thread/one", { manualStatus: "CLOSED" });
    await crmSalesWorkflowApi.schedule("thread/one", { at: "2027-01-01T12:00:00Z" });
    await crmSalesWorkflowApi.followUpAction("thread/one", "task/one", { action: "CANCEL" });
    expect(api.patch).toHaveBeenNthCalledWith(1, "/telegram-crm/conversations/thread%2Fone/sales-workflow", { manualStatus: "CLOSED" });
    expect(api.post).toHaveBeenCalledWith("/telegram-crm/conversations/thread%2Fone/follow-up", { at: "2027-01-01T12:00:00Z" });
    expect(api.patch).toHaveBeenNthCalledWith(2, "/telegram-crm/conversations/thread%2Fone/follow-up/task%2Fone", { action: "CANCEL" });
  });
  it("passes bounded cursor pagination and cancellation without joining history through the Deals API", async () => {
    const controller = new AbortController();
    await crmSalesWorkflowApi.purchases("client-a", "next-cursor", controller.signal);
    await crmSalesWorkflowApi.packages(null, controller.signal);
    expect(api.get).toHaveBeenCalledWith("/telegram-crm/contacts/client-a/purchases", { params: { cursor: "next-cursor", limit: 20 }, signal: controller.signal });
    expect(api.get).toHaveBeenCalledWith("/telegram-crm/package-sales-context", { params: { cursor: undefined, limit: 20 }, signal: controller.signal });
  });
  it("preserves authorization and network errors for component recovery", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Forbidden"));
    await expect(crmSalesWorkflowApi.get("thread-a")).rejects.toThrow("Forbidden");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  AiConfiguration,
  AiOperationsPage,
} from "@telegram-system/shared";
import { aiCost, aiMoney, aiPermissions } from "./ai-format";
import { aiKeys } from "@/lib/features/operations/ai-query-keys";
import { AiConfigurationPanel, readAiForm } from "./ai-configuration";
import { AiOperations } from "./ai-operations";
import { AiUsagePage } from "./ai-usage-page";
import { AiFilters } from "./ai-filters";
import { CrmAiUsage } from "./crm-ai-usage";
const mocks = vi.hoisted(() => ({
  configuration: vi.fn(),
  updateWorkspace: vi.fn(),
  operations: vi.fn(),
  usage: vi.fn(),
  me: vi.fn(),
}));
vi.mock("@/lib/features/operations/ai-api", () => ({ aiApi: { ...mocks } }));
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/api", () => ({ authApi: { me: mocks.me } }));
const config: AiConfiguration = {
  workspaceId: "one",
  canConfigure: true,
  providerConfigured: false,
  deploymentEnabled: false,
  currency: "USD",
  settings: {
    enabled: false,
    automaticEnabled: false,
    dailyBudget: null,
    monthlyBudget: null,
    maxRequestCost: null,
    warningPercent: 80,
  },
  categories: [],
  models: [],
};
function wrap(
  node: React.ReactNode,
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  }),
) {
  return {
    ...render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configuration.mockResolvedValue(config);
  mocks.operations.mockResolvedValue({
    items: [],
    nextCursor: null,
    hasMore: false,
  });
  mocks.me.mockResolvedValue({
    workspace: { id: "one", access: { isOwner: true, permissionKeys: [] } },
  });
});
describe("AI usage safeguards", () => {
  it("does not fetch protected data without workspace AI permissions", async () => {
    mocks.me.mockResolvedValue({
      workspace: { id: "one", access: { isOwner: false, permissionKeys: [] } },
    });
    wrap(<AiUsagePage />);
    await screen.findByRole("alert");
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.operations).not.toHaveBeenCalled();
    expect(mocks.configuration).not.toHaveBeenCalled();
  });
  it("lets a manage-only administrator configure AI without loading usage", async () => {
    mocks.me.mockResolvedValue({
      workspace: {
        id: "one",
        access: { isOwner: false, permissionKeys: ["operations.manageAi"] },
      },
    });
    wrap(<AiUsagePage />);
    await screen.findByText("Workspace limits");
    expect(
      screen.getByRole("tab", { name: "Usage & requests" }),
    ).toBeDisabled();
    expect(mocks.usage).not.toHaveBeenCalled();
    expect(mocks.operations).not.toHaveBeenCalled();
  });

  it("discovers held operations of all ages without date or status restrictions", async () => {
    wrap(
      <AiOperations
        workspaceId="one"
        filter={{
          workspaceId: "one",
          from: "2026-10-01",
          to: "2026-10-31",
          status: "FAILED",
          provider: "openai",
        }}
        canManage
      />,
    );
    await screen.findByText("No requests match these filters.");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Unresolved / held operations · all ages",
      }),
    );
    await waitFor(() =>
      expect(mocks.operations).toHaveBeenLastCalledWith({
        workspaceId: "one",
        from: undefined,
        to: undefined,
        status: undefined,
        provider: "openai",
        unresolved: true,
        cursor: undefined,
        limit: 25,
      }),
    );
  });

  it("applies filters only after explicit submit, avoiding reads while typing", () => {
    const change = vi.fn();
    wrap(<AiFilters filter={{}} onChange={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Model filter" }), {
      target: { value: "gpt-6-luna" },
    });
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(change).toHaveBeenCalledWith({ model: "gpt-6-luna" });
  });
  it("disables configuration editing for viewers", async () => {
    mocks.configuration.mockResolvedValue({ ...config, canConfigure: false });
    wrap(<AiConfigurationPanel workspaceId="one" />);
    expect(
      await screen.findByText(
        "Read-only. AI management permission is required.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save controls" })).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Workspace Daily budget (USD)" }),
    ).toBeDisabled();
  });

  it("preserves tiny exact USD decimals and marks incomplete costs", () => {
    expect(aiMoney("0.000000000001")).toBe("$0.000000000001");
    expect(aiMoney(null)).toBe("Unknown");
    expect(
      aiCost({ knownCost: "0", unpricedRequests: 1, unknownUsageRequests: 0 }),
    ).toBe("$0.00 + unknown");
  });
  it("isolates workspace, filters and cursor query roots", () => {
    expect(aiKeys.usage("one", {})).not.toEqual(aiKeys.usage("two", {}));
    expect(aiKeys.operations("one", { status: "FAILED" })).not.toEqual(
      aiKeys.operations("one", {}),
    );
    expect(aiKeys.configuration("one")).not.toEqual(aiKeys.analytics("one"));
  });
  it("keeps view and manage authorization separate", () => {
    expect(aiPermissions()).toEqual({ view: false, manage: false });
    expect(
      aiPermissions({
        isOwner: false,
        permissionKeys: ["operations.viewAiUsage"],
      }),
    ).toEqual({ view: true, manage: false });
    expect(aiPermissions({ isOwner: true, permissionKeys: [] })).toEqual({
      view: true,
      manage: true,
    });
  });
  it("rejects invalid money instead of coercing and keeps blank limits null", () => {
    const form = document.createElement("form");
    form.innerHTML =
      '<input name="dailyBudget" value="1e5"><input name="monthlyBudget" value=""><input name="maxRequestCost" value="">';
    expect(() => readAiForm(form)).toThrow();
    (form.elements.namedItem("dailyBudget") as HTMLInputElement).value =
      "10000000";
    expect(() => readAiForm(form)).toThrow();
    (form.elements.namedItem("dailyBudget") as HTMLInputElement).value =
      "0.000000000001";
    expect(readAiForm(form)).toMatchObject({
      dailyBudget: "0.000000000001",
      monthlyBudget: null,
    });
  });
  it("renders loading and empty telemetry without fabricated requests", async () => {
    mocks.operations.mockReturnValue(new Promise(() => {}));
    const view = wrap(
      <AiOperations workspaceId="one" filter={{}} canManage={false} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading requests");
    view.unmount();
    mocks.operations.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    wrap(<AiOperations workspaceId="one" filter={{}} canManage={false} />);
    expect(
      await screen.findByText("No requests match these filters."),
    ).toBeTruthy();
  });
  it("shows a recoverable error without exposing private payloads", async () => {
    mocks.operations.mockRejectedValue(new Error("secret-provider-body"));
    wrap(<AiOperations workspaceId="one" filter={{}} canManage={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Requests could not be loaded",
    );
    expect(screen.queryByText("secret-provider-body")).toBeNull();
  });
  it("loads the next cursor with the same filters", async () => {
    const first: AiOperationsPage = {
      items: [],
      nextCursor: "opaque-cursor",
      hasMore: true,
    };
    mocks.operations
      .mockResolvedValueOnce(first)
      .mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    wrap(
      <AiOperations
        workspaceId="one"
        filter={{ category: "SALES_FOLLOW_UP" }}
        canManage={false}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(mocks.operations).toHaveBeenLastCalledWith({
        category: "SALES_FOLLOW_UP",
        cursor: "opaque-cursor",
        limit: 25,
      }),
    );
  });
  it("keeps CRM analytics lazy until opened and cached when reopened", async () => {
    mocks.usage.mockResolvedValue({
      summary: {
        selected: {
          knownCost: "0",
          unpricedRequests: 0,
          unknownUsageRequests: 0,
          requests: 0,
        },
      },
      byFeature: [],
    });
    wrap(<CrmAiUsage />);
    const button = await screen.findByRole("button", { name: "AI Usage +" });
    expect(mocks.usage).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByText("This month · $0.00 · 0 requests");
    fireEvent.click(screen.getByRole("button", { name: "AI Usage −" }));
    fireEvent.click(screen.getByRole("button", { name: "AI Usage +" }));
    expect(mocks.usage).toHaveBeenCalledTimes(1);
  });
  it("reconciles authoritative configuration without another config GET", async () => {
    mocks.updateWorkspace.mockResolvedValue({
      ...config,
      settings: { ...config.settings, dailyBudget: "1.25" },
    });
    const { client } = wrap(<AiConfigurationPanel workspaceId="one" />);
    fireEvent.change(
      await screen.findByRole("textbox", {
        name: "Workspace Daily budget (USD)",
      }),
      { target: { value: "1.25" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save controls" }));
    await screen.findByText("Configuration saved.");
    expect(mocks.updateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ dailyBudget: "1.25", monthlyBudget: null }),
    );
    expect(client.getQueryData(aiKeys.configuration("one"))).toMatchObject({
      settings: { dailyBudget: "1.25" },
    });
    expect(mocks.configuration).toHaveBeenCalledTimes(1);
  });
  it("filters candidate first-offer cost history locally without loading aggregates or invoking AI", async () => {
    mocks.operations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    wrap(<AiOperations workspaceId="one" filter={{}} canManage={false} />);
    await screen.findByText("No requests match these filters.");
    fireEvent.click(screen.getByRole("checkbox", { name: "Candidate first-offer operations only" }));
    await waitFor(() => expect(mocks.operations).toHaveBeenLastCalledWith(expect.objectContaining({ businessScope: "CANDIDATE_FIRST_OFFER", category: "SALES_FIRST_DRAFT", limit: 25 })));
    expect(screen.getByText("History filter only. Financial totals above retain the selected category scope.")).toBeTruthy();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

});

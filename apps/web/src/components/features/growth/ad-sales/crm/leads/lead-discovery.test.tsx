import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { authApi } from "@/lib/api";
import { LeadDiscoveryPage } from "./lead-discovery-page";
import { LeadSources } from "./lead-sources";
import { LeadFeed } from "./lead-feed";
import { LeadSourceImport } from "./lead-source-import";
import {
  leadConfig,
  observationFixture,
  sourceFixture,
} from "./lead-fixtures.test-support";
vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../crm-navigation", () => ({ CrmNavigation: () => null }));
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(leadDiscoveryApi, "config").mockResolvedValue(leadConfig);
  vi.spyOn(leadDiscoveryApi, "sources").mockResolvedValue({
    items: [sourceFixture()],
    hasMore: false,
    nextCursor: null,
  });
  vi.spyOn(leadDiscoveryApi, "feed").mockResolvedValue({
    items: [observationFixture()],
    hasMore: false,
    nextCursor: null,
  });
  vi.spyOn(leadDiscoveryApi, "analyze").mockResolvedValue({
    analyzed: 1,
    extracted: 1,
    skipped: 0,
    unknown: 0,
    failed: 0,
  });
  vi.spyOn(leadDiscoveryApi, "accounts").mockResolvedValue([]);
  vi.spyOn(authApi, "me").mockResolvedValue({
    workspace: {
      id: "workspace-one",
      access: { isOwner: true, permissionKeys: [] },
    },
  } as never);
});
describe("Lead Discovery operational UI", () => {
  it("blocks discovery reads without the view permission", async () => {
    vi.mocked(authApi.me).mockResolvedValue({
      workspace: {
        id: "workspace-one",
        access: { isOwner: false, permissionKeys: [] },
      },
    } as never);
    mount(<LeadDiscoveryPage />);
    await screen.findByRole("alert");
    expect(leadDiscoveryApi.config).not.toHaveBeenCalled();
    expect(leadDiscoveryApi.sources).not.toHaveBeenCalled();
  });
  it("opens sources without AI calls, account enumeration or feed reads", async () => {
    mount(<LeadDiscoveryPage />);
    expect(screen.queryByRole("tablist", { name: "Lead Discovery sections" })).toBeNull();
    await screen.findByText("Evidence source 1");
    expect(leadDiscoveryApi.analyze).not.toHaveBeenCalled();
    expect(leadDiscoveryApi.accounts).not.toHaveBeenCalled();
    expect(leadDiscoveryApi.feed).not.toHaveBeenCalled();
  });
  it("shows distinct coverage and metrics without inventing a no-ads window or qualification", async () => {
    mount(<LeadSources workspace="workspace-one" config={leadConfig} />);
    await screen.findByText("Evidence source 1");
    expect(screen.getByText("Активен")).toBeTruthy();
    expect(screen.getByText(/3 публикаций · 1 рекламных · 1 кандидатов/)).toBeTruthy();
    expect(screen.queryByText("Coverage: GAPPED")).toBeNull();
    expect(screen.queryByText(/^NO_ADS_30D$/)).toBeNull();
  });
  it("disables management controls for read-only users", async () => {
    mount(
      <LeadSources
        workspace="workspace-one"
        config={{ ...leadConfig, canManage: false }}
      />,
    );
    await screen.findByText("Evidence source 1");
    expect(screen.queryByRole("button", { name: "Add source" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Validate access" }),
    ).toBeNull();
  });
  it("explains disconnected sources without pretending they are active", async () => {
    vi.mocked(leadDiscoveryApi.sources).mockResolvedValue({ items: [{ ...sourceFixture(), accountId: null, channelId: null, monitoringState: "PAUSED" }], hasMore: false, nextCursor: null });
    mount(<LeadSources workspace="workspace-one" config={leadConfig}/>);
    await screen.findByText("Не подключён");
    expect(screen.getByRole("button", { name: "Обновить" })).toBeDisabled();
    expect(screen.getByText("Требуется подключение Telegram и проверка доступа.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Scan up to 50 posts" })).toBeNull();
  });
  it("explains membership and public manual scanning instead of showing an opaque paused code", async () => {
    vi.mocked(leadDiscoveryApi.sources).mockResolvedValue({ items: [
      { ...sourceFixture(1), channelId: null, monitoringState: "ACCESS_LOST", lastErrorCode: "LEAD_CHANNEL_MEMBERSHIP_REQUIRED" },
      { ...sourceFixture(2), monitoringState: "PAUSED", accessType: "PUBLIC_CHANNEL" },
    ], hasMore: false, nextCursor: null });
    mount(<LeadSources workspace="workspace-one" config={leadConfig}/>);
    await screen.findByText("Нет подписки");
    expect(screen.getByText("Проверка вручную")).toBeTruthy();
    expect(screen.getByText(/Для этого приватного канала/)).toBeTruthy();
    expect(screen.queryByText("LEAD_CHANNEL_MEMBERSHIP_REQUIRED")).toBeNull();
  });
  it("loads source cursors while keeping status and search filters", async () => {
    vi.mocked(leadDiscoveryApi.sources)
      .mockResolvedValueOnce({
        items: [sourceFixture()],
        hasMore: true,
        nextCursor: "next-source",
      })
      .mockResolvedValue({
        items: [sourceFixture(2)],
        hasMore: false,
        nextCursor: null,
      });
    mount(<LeadSources workspace="workspace-one" config={leadConfig} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more sources" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.sources).toHaveBeenLastCalledWith(
        { limit: 50, cursor: "next-source" },
        expect.any(AbortSignal),
      ),
    );
  });
  it("applies source search explicitly rather than refetching every keystroke", async () => {
    mount(<LeadSources workspace="workspace-one" config={leadConfig} />);
    await screen.findByText("Evidence source 1");
    fireEvent.change(screen.getByRole("textbox", { name: "Search sources" }), {
      target: { value: "Education" },
    });
    expect(leadDiscoveryApi.sources).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Apply source filters" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.sources).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "Education" }),
        expect.any(AbortSignal),
      ),
    );
  });
  it("handles failed source reads with a safe retry state", async () => {
    vi.mocked(leadDiscoveryApi.sources).mockRejectedValueOnce(
      new Error("private-session-secret"),
    );
    mount(<LeadSources workspace="workspace-one" config={leadConfig} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "could not be loaded",
    );
    expect(screen.queryByText("private-session-secret")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Evidence source 1");
  });
  it("renders an empty feed without classifying or fabricating advertisements", async () => {
    vi.mocked(leadDiscoveryApi.feed).mockResolvedValue({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    mount(<LeadFeed workspace="workspace-one" config={leadConfig} />);
    await screen.findByText("No records match these filters.");
    expect(leadDiscoveryApi.analyze).not.toHaveBeenCalled();
  });
  it("shows UNKNOWN costs and requires a selected explicit analysis action", async () => {
    mount(<LeadFeed workspace="workspace-one" config={leadConfig} />);
    await screen.findByText("Public business offer 1");
    expect(
      screen.getByText("Classification cost: Unknown · UNKNOWN"),
    ).toBeTruthy();
    expect(leadDiscoveryApi.analyze).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select material 1" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Analyze 1 selected materials" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.analyze).toHaveBeenCalledWith(["observation-1"]),
    );
  });
  it("bounds analysis selections to five and prevents double-tap execution", async () => {
    vi.mocked(leadDiscoveryApi.feed).mockResolvedValue({
      items: Array.from({ length: 6 }, (_, i) => observationFixture(i + 1)),
      hasMore: false,
      nextCursor: null,
    });
    vi.mocked(leadDiscoveryApi.analyze).mockReturnValue(new Promise(() => {}));
    mount(<LeadFeed workspace="workspace-one" config={leadConfig} />);
    await screen.findByText("Public business offer 6");
    for (let n = 1; n <= 6; n++)
      fireEvent.click(
        screen.getByRole("checkbox", { name: `Select material ${n}` }),
      );
    expect(screen.getByRole("alert")).toHaveTextContent("no more than 5");
    const button = screen.getByRole("button", {
      name: "Analyze 5 selected materials",
    });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(leadDiscoveryApi.analyze).toHaveBeenCalledTimes(1),
    );
    expect(vi.mocked(leadDiscoveryApi.analyze).mock.calls[0][0]).toHaveLength(
      5,
    );
  });
  it("explains rejected evidence without silently retrying a paid analysis", async () => {
    vi.mocked(leadDiscoveryApi.analyze).mockResolvedValue({
      analyzed: 0, extracted: 0, skipped: 0, unknown: 0, failed: 1,
      failures: [{ observationId: "observation-1", stage: "classification", code: "LEAD_CLASSIFICATION_EVIDENCE_NOT_LITERAL" }],
    });
    mount(<LeadFeed workspace="workspace-one" config={leadConfig} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select material 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Analyze 1 selected materials" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ИИ не подтвердил вывод");
    expect(leadDiscoveryApi.analyze).toHaveBeenCalledTimes(1);
  });
  it("sends the risk filter to the server instead of filtering one loaded page", async () => {
    mount(<LeadFeed workspace="workspace-one" config={leadConfig} />);
    await screen.findByText("Public business offer 1");
    fireEvent.click(
      screen.getByText("All risk states", { exact: true }).closest("button")!,
    );
    fireEvent.click(await screen.findByText("SUSPICIOUS", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Apply feed filters" }));
    await waitFor(() =>
      expect(leadDiscoveryApi.feed).toHaveBeenLastCalledWith(
        expect.objectContaining({ riskStatus: "SUSPICIOUS" }),
        expect.any(AbortSignal),
      ),
    );
  });
  it("previews duplicates/errors and imports valid new sources only after confirmation", async () => {
    vi.spyOn(leadDiscoveryApi, "preview").mockResolvedValue({
      rows: [
        {
          reference: "@new_source",
          normalizedKey: "tg:new_source",
          error: null,
          existingId: null,
        },
        {
          reference: "@existing",
          normalizedKey: "tg:existing",
          error: null,
          existingId: "source-existing",
        },
        {
          reference: "bad",
          normalizedKey: null,
          error: "INVALID_REFERENCE",
          existingId: null,
        },
      ],
      validCount: 2,
    });
    vi.spyOn(leadDiscoveryApi, "importSources").mockResolvedValue({
      created: 1,
      existing: 0,
      errors: [],
    });
    mount(<LeadSourceImport workspace="workspace-one" onClose={() => {}} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Source list" }), {
      target: { value: "@new_source\n@existing\nbad" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Import processing reference" }),
      { target: { value: "policy:approved" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview sources" }));
    await screen.findByText("INVALID_REFERENCE");
    expect(leadDiscoveryApi.importSources).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Import valid new sources" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.importSources).toHaveBeenCalledWith([
        {
          type: "TELEGRAM_CHANNEL",
          reference: "@new_source",
          processingReference: "policy:approved",
        },
      ]),
    );
  });
});

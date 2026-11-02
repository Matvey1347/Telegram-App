import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { LeadSources } from "./lead-sources";
import { leadConfig, sourceFixture } from "./lead-fixtures.test-support";

describe("source table", () => {
  it("shows compact source details and filters all fetched pages by monitoring state", async () => {
    const active = { ...sourceFixture(1), username: "example_channel", title: "Тема · Канал", metrics: { ...sourceFixture().metrics, observedPosts: 12, uniqueCandidates: 3 } };
    const paused = { ...sourceFixture(2), username: "../invalid", monitoringState: "PAUSED" as const };
    const query = vi.spyOn(leadDiscoveryApi, "sources").mockImplementation(async ({ cursor }) => cursor ? {items: [paused], hasMore: false, nextCursor: null} : {items: [active], hasMore: true, nextCursor: "next"});
    const client = new QueryClient({ defaultOptions: { queries: {retry:false} } });
    render(<QueryClientProvider client={client}><LeadSources workspace="workspace-one" config={leadConfig} /></QueryClientProvider>);
    expect(await screen.findByRole("heading", {name:"Канал"})).toBeTruthy();
    expect(screen.getByText("Тема")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(document.querySelector('img[src="https://t.me/i/userpic/320/example_channel.jpg"]')).toBeTruthy();
    expect(document.querySelectorAll('img[src*="invalid"]')).toHaveLength(0);
    expect(query).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByLabelText("Статус источника"));
    fireEvent.click(screen.getByRole("button", {name:/Неактивные/}));
    await waitFor(() => expect(screen.queryByRole("heading", {name:"Канал"})).toBeNull());
    expect(screen.getByRole("heading", {name:"Evidence source 2"})).toBeTruthy();
    query.mockRestore();
  });
});

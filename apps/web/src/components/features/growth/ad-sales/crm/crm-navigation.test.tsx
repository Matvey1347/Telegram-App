import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmNavigation } from "./crm-navigation";

const navigation = vi.hoisted(() => ({ pathname: "/ad-sales" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

describe("CrmNavigation", () => {
  beforeEach(() => {
    navigation.pathname = "/ad-sales";
  });

  it("uses one Ad Sales tab bar without CRM contact-view tabs", () => {
    renderNavigation(<CrmNavigation canViewInbox canViewSales inboxUnread={3} />);

    const nav = screen.getByRole("navigation", { name: "CRM navigation" });
    expect(nav.className).toContain("rounded-[18px]");
    expect(screen.getByRole("link", { name: "Clients" }).className).toContain(
      "after:bg-blue-500",
    );
    expect(screen.getByRole("link", { name: /Inbox/ })).toHaveAttribute(
      "href",
      "/ad-sales/inbox",
    );
    expect(screen.queryByRole("link", { name: "All contacts" })).toBeNull();
    expect(screen.queryByText("Follow-up")).toBeNull();
  });

  it("does not expose tabs that the member cannot access", () => {
    renderNavigation(<CrmNavigation canViewInbox={false} canViewSales={false} />);

    expect(screen.queryByRole("link", { name: /Inbox/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Deals" })).toBeNull();
    expect(screen.getByRole("link", { name: "Clients" })).toBeTruthy();
  });
});

function renderNavigation(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

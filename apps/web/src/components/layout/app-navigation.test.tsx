import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppNavigation } from "./app-navigation";

describe("AppNavigation permissions", () => {
  it("keeps one CRM entry and lands leads-only roles in their permitted workspace", () => {
    render(
      <AppNavigation
        pathname="/ad-sales/leads"
        openGroups={{ growth: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin={false}
        effectiveFeatureIds={["adSales.leads"]}
        effectivePermissionKeys={["adSales.leads.view"]}
      />,
    );
    expect(screen.getByRole("link", { name: "CRM" })).toHaveAttribute(
      "href",
      "/ad-sales/leads",
    );
    expect(screen.getByRole("link", { name: "CRM" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("link", { name: "Finance" })).toBeNull();
  });

  it("omits features absent from effective access", () => {
    render(
      <AppNavigation
        pathname="/"
        openGroups={{ telegram: true, growth: true, operations: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin={false}
        effectiveFeatureIds={["dashboard", "posts"]}
      />,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
    expect(screen.queryByText("Resources")).not.toBeInTheDocument();
  });

  it("keeps the legacy owner fallback when no access snapshot exists", () => {
    render(
      <AppNavigation
        pathname="/roles"
        openGroups={{ telegram: false, growth: false, operations: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin
      />,
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("keeps Telegram navigation for posts and calendar access without a separate AI Posting link", () => {
    render(
      <AppNavigation
        pathname="/telegram-posts"
        openGroups={{ telegram: true, growth: true, operations: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin={false}
        effectiveFeatureIds={["posts"]}
        effectivePermissionKeys={[]}
      />,
    );

    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Telegram/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "AI Posting" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Growth/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Operations/i })).toBeNull();
  });

  it("shows CRM when either CRM or legacy sales is available", () => {
    const { rerender } = render(
      <AppNavigation
        pathname="/ad-sales"
        openGroups={{ growth: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin={false}
        effectiveFeatureIds={["adSales.crm"]}
        effectivePermissionKeys={[]}
      />,
    );
    expect(screen.getByRole("link", { name: "CRM" })).toBeInTheDocument();
    rerender(
      <AppNavigation
        pathname="/ad-sales/sales"
        openGroups={{ growth: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin={false}
        effectiveFeatureIds={["adSales.sales"]}
        effectivePermissionKeys={[]}
      />,
    );
    expect(screen.getByRole("link", { name: "CRM" })).toBeInTheDocument();
  });

  it("consolidates Growth ads and Operations under Ads and Settings", () => {
    render(
      <AppNavigation
        pathname="/ad-campaigns/mutual-promotion"
        openGroups={{ growth: true }}
        onToggleGroup={vi.fn()}
        canViewAdmin
        effectiveFeatureIds={[
          "advertising",
          "workspace",
          "operations",
          "members",
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "ADS" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("link", { name: "ADS" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText("Mutual promotion")).not.toBeInTheDocument();
    expect(screen.queryByText("System logs")).not.toBeInTheDocument();
    expect(screen.queryByText("Scheduled tasks")).not.toBeInTheDocument();
    expect(screen.queryByText("Trash")).not.toBeInTheDocument();
    expect(screen.queryByText("Roles & access")).not.toBeInTheDocument();

    const growth = screen.getByRole("button", { name: /Growth/i });
    const workspace = screen.getByRole("link", {
      name: "Settings",
    });
    expect(
      growth.compareDocumentPosition(workspace) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(growth).toHaveClass(
      "focus-visible:ring-inset",
      "focus-visible:outline-none",
    );
  });
});

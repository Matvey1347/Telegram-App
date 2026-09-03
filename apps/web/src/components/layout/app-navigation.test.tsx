import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppNavigation } from "./app-navigation";

describe("AppNavigation permissions", () => {
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
    expect(screen.getByText("Roles & access")).toBeInTheDocument();
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("renders posts directly when it is the only accessible page", () => {
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
    expect(screen.queryByRole("button", { name: /Telegram/i })).toBeNull();
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
});

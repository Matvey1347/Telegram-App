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
    expect(screen.queryByText("Channels")).not.toBeInTheDocument();
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
});

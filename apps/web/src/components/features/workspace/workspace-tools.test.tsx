import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceTools } from "./workspace-tools";

describe("WorkspaceTools", () => {
  it("collects owner administration routes without exposing system logs", () => {
    render(<WorkspaceTools role="owner" />);
    expect(screen.getByRole("link", { name: /Roles & access/ })).toHaveAttribute("href", "/roles");
    expect(screen.getByRole("link", { name: /Scheduled tasks/ })).toHaveAttribute("href", "/scheduled-tasks");
    expect(screen.getByRole("link", { name: /Trash/ })).toHaveAttribute("href", "/trash");
    expect(screen.queryByText(/System logs/i)).not.toBeInTheDocument();
  });

  it("keeps restricted tools hidden from a member without permissions", () => {
    render(
      <WorkspaceTools
        role="member"
        access={{
          roleId: "role",
          roleVersion: 1,
          isOwner: false,
          permissionKeys: [],
          featureIds: ["workspace"],
        }}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

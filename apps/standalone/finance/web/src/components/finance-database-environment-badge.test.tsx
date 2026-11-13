import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { environment, detectDatabase } = vi.hoisted(() => ({ environment: { isDevelopment: true, databaseEnvironment: "local" as string | undefined }, detectDatabase: vi.fn(() => "local") }));
vi.mock("@finance-web/config/public-env", () => ({ publicFinanceWebEnvironment: environment }));
vi.mock("../../../../../../scripts/dev-database-environment.mjs", () => ({ localDatabaseEnvironment: detectDatabase }));
import { FinanceDatabaseEnvironmentBadge } from "./finance-database-environment-badge";

describe("FinanceDatabaseEnvironmentBadge", () => {
  it("shows the badge for a local development database", () => {
    environment.isDevelopment = true;
    environment.databaseEnvironment = "local";
    render(<FinanceDatabaseEnvironmentBadge />);
    expect(screen.getByRole("status")).toHaveTextContent("LOCAL DATABASE");
  });

  it("hides the badge for a remote database and in production", () => {
    environment.isDevelopment = true;
    environment.databaseEnvironment = "";
    const view = render(<FinanceDatabaseEnvironmentBadge />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    environment.isDevelopment = false;
    environment.databaseEnvironment = "local";
    view.rerender(<FinanceDatabaseEnvironmentBadge />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("detects the local database when the development server predates the launcher flag", () => {
    environment.isDevelopment = true;
    environment.databaseEnvironment = undefined;
    detectDatabase.mockReturnValue("local");
    const view = render(<FinanceDatabaseEnvironmentBadge />);
    expect(screen.getByRole("status")).toHaveTextContent("LOCAL DATABASE");
    detectDatabase.mockReturnValue("");
    view.rerender(<FinanceDatabaseEnvironmentBadge />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

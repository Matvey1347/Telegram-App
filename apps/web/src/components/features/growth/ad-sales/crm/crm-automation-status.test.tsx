import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrmAutomationStatus } from "./crm-automation-status";
import { automationStatusFixture } from "./crm-automation-test-fixtures";

describe("CrmAutomationStatus", () => {
  it("renders only server-provided gate readiness and keeps source facts distinct", () => {
    const status = automationStatusFixture();
    status.deals[0]!.evaluated.PUBLISHED_LINKS = {
      allowed: true,
      reason: "ELIGIBLE",
    };
    render(
      <CrmAutomationStatus
        status={status}
        refreshing={false}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("Protected legacy state")).toBeTruthy();
    expect(
      screen.getByText("Current server safety-gate readiness"),
    ).toBeTruthy();
    expect(screen.getByText("Gates ready")).toBeTruthy();
    expect(screen.getByText("Workspace Disabled")).toBeTruthy();
    expect(screen.getByText("Contact Type Disabled")).toBeTruthy();
    expect(screen.getByText("Sent")).toBeTruthy();
    expect(screen.getByText("Skipped")).toBeTruthy();
    expect(
      screen.getByText(
        /fresh source event plus type-specific facts are still required/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/does not poll/i)).toBeTruthy();
  });

  it("shows a safe empty state that keeps manual messages available", () => {
    const status = automationStatusFixture();
    status.deals = [];
    render(
      <CrmAutomationStatus
        status={status}
        refreshing={false}
        onRefresh={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        /No Deal automation status or executions are available/i,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Manual messages remain available/i)).toBeTruthy();
  });
});

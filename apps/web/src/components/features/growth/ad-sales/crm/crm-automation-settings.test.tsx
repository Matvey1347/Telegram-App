import type { SelectHTMLAttributes } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrmAutomationSettings } from "./crm-automation-settings";
import { automationStatusFixture } from "./crm-automation-test-fixtures";

vi.mock("@/components/ui/primitives", async () => {
  const actual = await vi.importActual<
    typeof import("@/components/ui/primitives")
  >("@/components/ui/primitives");
  return {
    ...actual,
    Select: (props: SelectHTMLAttributes<HTMLSelectElement>) => (
      <select {...props} />
    ),
  };
});

function settingsProps() {
  return {
    status: automationStatusFixture(),
    conversations: [],
    conversationsLoading: false,
    conversationsError: false,
    canManageWorkspace: true,
    canManageContact: true,
    pending: { workspace: false, contact: false, deal: false, followUp: false },
    errors: { workspace: false, contact: false, deal: false, followUp: false },
    onWorkspaceEnabled: vi.fn().mockResolvedValue(undefined),
    onWorkspaceType: vi.fn().mockResolvedValue(undefined),
    onWorkspaceLocale: vi.fn().mockResolvedValue(undefined),
    onContactEnabled: vi.fn().mockResolvedValue(undefined),
    onContactLocale: vi.fn().mockResolvedValue(undefined),
    onContactType: vi.fn().mockResolvedValue(undefined),
    onDealUpdate: vi.fn().mockResolvedValue(undefined),
    onFollowUp: vi.fn().mockResolvedValue(undefined),
    onRetryConversations: vi.fn(),
  };
}

describe("CrmAutomationSettings", () => {
  it("confirms workspace and Contact opt-in with fail-safe copy", async () => {
    const props = settingsProps();
    render(<CrmAutomationSettings {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Workspace off" }));
    expect(props.onWorkspaceEnabled).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/does not bulk-enable Contacts or Deals/i),
    ).toHaveLength(2);
    expect(
      screen.getByText(
        /does not replay or create sends from historical facts/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/only future post-cutover facts may send/i),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Allow future messages" }),
    );
    await waitFor(() =>
      expect(props.onWorkspaceEnabled).toHaveBeenCalledWith(true),
    );

    fireEvent.click(screen.getByRole("button", { name: "Contact off" }));
    expect(props.onContactEnabled).not.toHaveBeenCalled();
    expect(
      screen.getByText(/does not enable any protected Deal/i),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Allow future messages" }),
    );
    await waitFor(() =>
      expect(props.onContactEnabled).toHaveBeenCalledWith(true),
    );
  });

  it("keeps a protected legacy Deal explicit and confirms its enable action", async () => {
    const props = settingsProps();
    render(<CrmAutomationSettings {...props} />);

    expect(screen.getByText(/Protected legacy Deal/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Overall policy"), {
      target: { value: "ENABLED" },
    });
    expect(props.onDealUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Enable protected Deal automation")).toBeTruthy();
    expect(
      screen.getByText(/never bypasses the workspace kill switch/i),
    ).toBeTruthy();
    expect(screen.getByText(/may schedule a reminder/i)).toBeTruthy();
    expect(
      screen.getByText(/placement is already inside.*may send immediately/i),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /does not replay historical publications or completed events/i,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Enable protected Deal" }),
    );
    await waitFor(() =>
      expect(props.onDealUpdate).toHaveBeenCalledWith("deal-legacy-123456", {
        override: "ENABLED",
      }),
    );
  });

  it("updates Contact and Deal type overrides without client eligibility logic", () => {
    const props = settingsProps();
    render(<CrmAutomationSettings {...props} />);
    const publishedLinks = screen.getAllByLabelText(/^Published links/);

    fireEvent.click(
      screen.getByRole("button", { name: "Published links off" }),
    );
    fireEvent.change(publishedLinks[0]!, { target: { value: "DISABLED" } });
    fireEvent.change(publishedLinks[1]!, { target: { value: "ENABLED" } });

    expect(props.onWorkspaceType).toHaveBeenCalledWith("PUBLISHED_LINKS", true);
    expect(props.onContactType).toHaveBeenCalledWith(
      "PUBLISHED_LINKS",
      "DISABLED",
    );
    expect(props.onDealUpdate).toHaveBeenCalledWith("deal-legacy-123456", {
      typeOverrides: { PUBLISHED_LINKS: "ENABLED" },
    });
  });

  it("configures customer follow-up separately from internal tasks", () => {
    const props = settingsProps();
    render(<CrmAutomationSettings {...props} />);
    const value = "2026-09-04T12:30";

    fireEvent.change(screen.getByLabelText("Explicit customer follow-up"), {
      target: { value },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));

    expect(props.onFollowUp).toHaveBeenCalledWith(
      "deal-legacy-123456",
      new Date(value).toISOString(),
    );
    expect(screen.getByText(/not an internal CRM task/i)).toBeTruthy();
    expect(screen.getByText(/may send immediately/i)).toBeTruthy();
  });

  it("states that manual messaging is independent when automation is off", () => {
    render(<CrmAutomationSettings {...settingsProps()} />);
    expect(
      screen.getByText(
        /Manual Telegram messages stay available whether automation is on or off/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: "Workspace default" }),
    ).toBeTruthy();
  });
});

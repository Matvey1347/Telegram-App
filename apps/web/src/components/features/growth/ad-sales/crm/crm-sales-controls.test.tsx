import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrmSalesWorkflow } from "@telegram-system/shared";
import { crmSalesWorkflowApi } from "@/lib/features/growth/crm-sales-workflow-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { CrmSalesControls } from "./crm-sales-controls";

vi.mock("@/lib/features/growth/crm-sales-workflow-api", () => ({ crmSalesWorkflowApi: { get: vi.fn(), setStatus: vi.fn(), schedule: vi.fn(), followUpAction: vi.fn() } }));
const workflow: CrmSalesWorkflow = { conversationId: "thread-a", contactId: "client-a", manualStatus: null, attentionStatus: "NEEDS_REPLY", conversationState: "ACTIVE", nextContactAt: null,
  nextFollowUp: null, commercialOutreachAllowed: true, outreachBlockedReason: null, canEdit: true };
const reminder = { id: "task-a", title: "Discuss the package", dueAt: "2026-10-31T11:00:00.000Z", effectiveAt: "2026-10-31T11:00:00.000Z", remindAt: null, snoozedUntil: null, assignedMemberId: "manager-a", status: "OPEN" as const };
function setup(compact = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><CrmSalesControls conversationId="thread-a" compact={compact} /></QueryClientProvider>);
  return { client, ...view };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(crmSalesWorkflowApi.get).mockResolvedValue(workflow);
  vi.mocked(crmSalesWorkflowApi.setStatus).mockResolvedValue({ ...workflow, manualStatus: "INTERESTED", attentionStatus: "INTERESTED" });
  vi.mocked(crmSalesWorkflowApi.schedule).mockResolvedValue({ ...workflow, nextFollowUp: reminder, nextContactAt: reminder.effectiveAt });
  vi.mocked(crmSalesWorkflowApi.followUpAction).mockResolvedValue(workflow);
});

describe("CRM sales controls", () => {
  it("stores only a manual business decision and reconciles the authoritative workflow", async () => {
    const { client } = setup();
    const select = await screen.findByRole("button", { name: "Sales status" });
    await userEvent.click(select);
    await userEvent.click(screen.getByRole("button", { name: "Interested" }));
    await waitFor(() => expect(client.getQueryData<CrmSalesWorkflow>(telegramCrmKeys.salesWorkflow("thread-a"))?.manualStatus).toBe("INTERESTED"));
    expect(crmSalesWorkflowApi.setStatus).toHaveBeenCalledWith("thread-a", { manualStatus: "INTERESTED" });
    expect(screen.queryByRole("option", { name: "Waiting for client" })).not.toBeInTheDocument();
    expect(screen.getByText("Interested", { selector: "p" })).toBeInTheDocument();
  });
  it("keeps the old decision visible and offers error feedback when a status mutation fails", async () => {
    vi.mocked(crmSalesWorkflowApi.setStatus).mockRejectedValue(new Error("Permission changed"));
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Sales status" }));
    await userEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    expect(screen.getByRole("button", { name: "Sales status" })).toHaveTextContent("Automatic");
    expect(screen.getByText("Needs reply")).toBeInTheDocument();
  });
  it("schedules only after an explicit date/time form submission", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: "Schedule follow-up" }));
    fireEvent.change(screen.getByLabelText("Reminder text"), { target: { value: "Discuss the package" } });
    expect(crmSalesWorkflowApi.schedule).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(crmSalesWorkflowApi.schedule).toHaveBeenCalledWith("thread-a", { at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), title: "Discuss the package" }));
    expect(await screen.findByText("Discuss the package")).toBeInTheDocument();
  });
  it.each(["Reschedule", "Snooze"] as const)("submits %s for the exact reminder instead of creating another task", async (label) => {
    vi.mocked(crmSalesWorkflowApi.get).mockResolvedValue({ ...workflow, nextFollowUp: reminder, nextContactAt: reminder.effectiveAt });
    setup();
    await userEvent.click(await screen.findByRole("button", { name: label }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(crmSalesWorkflowApi.followUpAction).toHaveBeenCalledWith("thread-a", reminder.id, { action: label === "Snooze" ? "SNOOZE" : "RESCHEDULE", at: expect.any(String) }));
    expect(crmSalesWorkflowApi.schedule).not.toHaveBeenCalled();
  });
  it.each([["Complete", "COMPLETE"], ["Cancel reminder", "CANCEL"]] as const)("performs %s and replaces the active reminder", async (label, action) => {
    vi.mocked(crmSalesWorkflowApi.get).mockResolvedValue({ ...workflow, nextFollowUp: reminder, nextContactAt: reminder.effectiveAt });
    setup(); await userEvent.click(await screen.findByRole("button", { name: label }));
    await waitFor(() => expect(crmSalesWorkflowApi.followUpAction).toHaveBeenCalledWith("thread-a", reminder.id, { action }));
    expect(await screen.findByText("No follow-up scheduled.")).toBeInTheDocument();
  });
  it("honors server ownership permission and DNC without generating outreach", async () => {
    vi.mocked(crmSalesWorkflowApi.get).mockResolvedValue({ ...workflow, canEdit: false, manualStatus: "DO_NOT_CONTACT", attentionStatus: "DO_NOT_CONTACT", commercialOutreachAllowed: false, outreachBlockedReason: "DO_NOT_CONTACT" });
    setup(); expect(await screen.findByRole("button", { name: "Sales status" })).toBeDisabled();
    expect(screen.getByText(/Manual sending is blocked/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule follow-up" })).not.toBeInTheDocument();
    expect(crmSalesWorkflowApi.setStatus).not.toHaveBeenCalled();
  });
  it("uses a touch-sized compact action menu with the same command path", async () => {
    setup(true);
    await waitFor(() => expect(crmSalesWorkflowApi.get).toHaveBeenCalledOnce());
    await userEvent.click(screen.getByRole("button", { name: "Sales actions" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Change sales status" }));
    expect(screen.getByRole("dialog", { name: "Change sales status" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sales status" }));
    await userEvent.click(screen.getByRole("button", { name: "Interested" }));
    await waitFor(() => expect(crmSalesWorkflowApi.setStatus).toHaveBeenCalledOnce());
  });
});

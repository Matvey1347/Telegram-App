import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CrmContactDetail } from "@telegram-system/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CrmContactNotes } from "./crm-contact-notes";
import { CrmContactTasks } from "./crm-contact-tasks";

const mocks = vi.hoisted(() => ({
  listTasks: vi.fn(),
  createTask: vi.fn(),
  completeTask: vi.fn(),
  listActivities: vi.fn(),
  createNote: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramAdSalesApi: {
    listCrmTasks: mocks.listTasks,
    createAdvertiserTask: mocks.createTask,
    completeCrmTask: mocks.completeTask,
    listAdvertiserActivities: mocks.listActivities,
    createAdvertiserNote: mocks.createNote,
  },
}));

const contact = {
  id: "contact-1",
  ownerMemberId: "member-1",
} as CrmContactDetail;

function renderWithQuery(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  );
}

describe("CRM contact workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTasks.mockResolvedValue({
      items: [
        {
          id: "task-1",
          title: "Call client",
          status: "OPEN",
          dueAt: "2026-09-04T10:00:00.000Z",
        },
      ],
    });
    mocks.createTask.mockResolvedValue({ id: "task-2" });
    mocks.completeTask.mockResolvedValue({ id: "task-1", status: "COMPLETED" });
    mocks.listActivities.mockResolvedValue({ items: [] });
    mocks.createNote.mockResolvedValue({ id: "activity-1" });
  });

  it("creates and completes contact tasks", async () => {
    renderWithQuery(<CrmContactTasks contact={contact} canEdit />);

    expect(await screen.findByText("Call client")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(() =>
      expect(mocks.completeTask).toHaveBeenCalledWith("task-1"),
    );

    fireEvent.change(screen.getByLabelText("Task title"), {
      target: { value: "Prepare offer" },
    });
    fireEvent.change(screen.getByLabelText("Task due date"), {
      target: { value: "2026-09-05T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledWith(
        "contact-1",
        expect.objectContaining({
          assignedMemberId: "member-1",
          title: "Prepare offer",
          type: "MANUAL",
        }),
      ),
    );
  });

  it("adds a note to the contact activity history", async () => {
    renderWithQuery(<CrmContactNotes contact={contact} canEdit />);

    expect(
      await screen.findByText("No notes or activity yet."),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New contact note"), {
      target: { value: "Client prefers morning calls" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    await waitFor(() =>
      expect(mocks.createNote).toHaveBeenCalledWith("contact-1", {
        type: "NOTE_ADDED",
        title: "Client prefers morning calls",
      }),
    );
  });
});

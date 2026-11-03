import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicationSchedulesModal } from "./publication-schedules-modal";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    telegramPublicationSchedulesApi: {
      list: mocks.list,
      create: mocks.create,
      update: mocks.update,
      remove: mocks.remove,
    },
  };
});
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ onChange }: { onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange("icon-1")}>
      Add emoji
    </button>
  ),
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.pushToast }),
}));

function renderModal() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PublicationSchedulesModal onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.list.mockReset();
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.remove.mockReset();
  mocks.pushToast.mockReset();
  mocks.list.mockResolvedValue([]);
});

describe("PublicationSchedulesModal", () => {
  it("opens an existing cached schedule in chronological order", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([{
      id: "schedule-order", name: "Order test", iconId: null, iconPresentation: null,
      timezone: "Europe/Warsaw", isDefault: false, assignedChannelsCount: 0,
      assignedChannelIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      slots: [
        { id: "first", title: "Second post", kind: "CONTENT", time: "12:10", position: 0, isActive: true },
        { id: "later", title: "Third ad", kind: "AD", time: "18:10", position: 1, isActive: true },
        { id: "middle", title: "Second ad", kind: "AD", time: "13:10", position: 2, isActive: true },
      ],
    }]);
    renderModal();
    await user.click(await screen.findByRole("button", { name: "Edit Order test" }));
    expect(screen.getByLabelText("Slot 1 title")).toHaveValue("Second post");
    expect(screen.getByLabelText("Slot 2 title")).toHaveValue("Second ad");
    expect(screen.getByLabelText("Slot 2 time")).toHaveValue("13:10");
    expect(screen.getByLabelText("Slot 3 title")).toHaveValue("Third ad");
  });

  it("requires confirmation before deleting a schedule from its card", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([
      {
        id: "schedule-1",
        name: "Main plan",
        iconId: null,
        iconPresentation: { type: "unicode", value: "🍃" },
        timezone: "Europe/Kyiv",
        isDefault: false,
        assignedChannelsCount: 0,
        slots: [
          {
            id: "slot-1",
            scheduleId: "schedule-1",
            title: "Morning post",
            kind: "CONTENT",
            time: "09:00",
            position: 0,
            isActive: true,
            iconPresentation: null,
          },
        ],
        createdAt: "2026-09-14T00:00:00.000Z",
        updatedAt: "2026-09-14T00:00:00.000Z",
      },
    ]);
    mocks.remove.mockResolvedValue({ success: true });
    renderModal();

    const removeButton = await screen.findByRole("button", {
      name: "Delete Main plan",
    });
    const editButton = screen.getByRole("button", { name: "Edit Main plan" });
    for (const actionButton of [editButton, removeButton]) {
      expect(actionButton).toHaveClass("h-8", "w-8");
      expect(actionButton.querySelector("svg")).toHaveAttribute("width", "20");
    }
    expect(screen.getByText(/🇺🇦 Europe\/Kyiv · 09:00/)).toBeInTheDocument();
    expect(removeButton).toHaveClass("bg-red-600");
    await user.click(removeButton);
    expect(mocks.remove).not.toHaveBeenCalled();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm deletion" }));

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
    expect(mocks.remove.mock.calls[0]?.[0]).toBe("schedule-1");
    await waitFor(() =>
      expect(screen.queryByText("Main plan")).not.toBeInTheDocument(),
    );
  });

  it("creates a daily schedule with the shared time field and emoji", async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({
      id: "schedule-1",
      name: "Main plan",
      iconId: "icon-1",
      iconPresentation: null,
      isDefault: false,
      assignedChannelsCount: 0,
      slots: [],
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    renderModal();

    await user.click(
      await screen.findByRole("button", { name: "New schedule" }),
    );

    expect(
      screen.getByRole("button", { name: "Back to schedules" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Back to schedules")).not.toBeInTheDocument();
    expect(screen.queryByText("Timezone")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/weekday/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Slot 1 time")).toHaveAttribute(
      "type",
      "text",
    );
    expect(screen.getByRole("button", { name: "Slot" })).toHaveClass(
      "bg-blue-600",
    );
    expect(screen.getByRole("button", { name: "Remove slot 1" })).toHaveClass(
      "bg-red-600",
    );
    await user.click(
      screen.getByRole("button", { name: "Slot 1 type" }),
    );
    expect(
      screen.getAllByRole("option", { name: "📝 Regular publication" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("option", {
        name: "📣 Advertising / mutual promotion",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "🤝 Mutual promotion" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("option", {
        name: "📣 Advertising / mutual promotion",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Add emoji" }));
    await user.type(
      screen.getByPlaceholderText("Main publication plan"),
      "Main plan",
    );
    await user.click(screen.getByRole("button", { name: "Save schedule" }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith({
      name: "Main plan",
      iconId: "icon-1",
      slots: [{ title: "Morning post", kind: "AD", time: "09:00", position: 0, isOptional: false }],
    });
  });

  it("restores an unfinished new schedule from workspace modal drafts", async () => {
    const user = userEvent.setup();
    const first = renderModal();
    await user.click(
      await screen.findByRole("button", { name: "New schedule" }),
    );
    await user.type(
      screen.getByPlaceholderText("Main publication plan"),
      "Unfinished plan",
    );
    await waitFor(() =>
      expect(
        localStorage.getItem("telegram:publication-schedule:draft:default"),
      ).toContain("Unfinished plan"),
    );
    first.unmount();

    renderModal();
    await user.click(
      await screen.findByRole("button", { name: "New schedule" }),
    );
    expect(await screen.findByText("Saved drafts")).toBeInTheDocument();
    expect(screen.getByText("Unfinished plan")).toBeInTheDocument();
  });
});

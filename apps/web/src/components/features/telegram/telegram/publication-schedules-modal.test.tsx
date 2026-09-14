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
      screen.getByRole("button", { name: "📝 Regular publication" }),
    );
    expect(
      screen.getAllByRole("button", { name: "📝 Regular publication" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: "📣 Advertising / mutual promotion",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "🤝 Mutual promotion" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
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
      slots: [{ title: "Morning post", kind: "AD", time: "09:00" }],
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

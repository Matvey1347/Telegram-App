import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelPublicationScheduleSettings } from "./channel-publication-schedule-settings";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  getAssignment: vi.fn(),
  assign: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    telegramPublicationSchedulesApi: {
      list: mocks.list,
      getAssignment: mocks.getAssignment,
      assign: mocks.assign,
    },
  };
});
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.pushToast }),
}));

const schedule = {
  id: "schedule-1",
  name: "Main Publications Plan",
  iconId: null,
  iconPresentation: { type: "unicode" as const, value: "🍃" },
  isDefault: false,
  assignedChannelsCount: 0,
  slots: [
    {
      id: "slot-1",
      scheduleId: "schedule-1",
      title: "Morning post",
      kind: "CONTENT" as const,
      time: "09:00",
      position: 0,
      isActive: true,
      iconPresentation: null,
    },
    {
      id: "slot-2",
      scheduleId: "schedule-1",
      title: "Ad post",
      kind: "AD" as const,
      time: "17:00",
      position: 1,
      isActive: true,
      iconPresentation: null,
    },
  ],
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

function renderSettings(onChange = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ChannelPublicationScheduleSettings
        channelId="channel-1"
        onChange={onChange}
      />
    </QueryClientProvider>,
  );
}

describe("ChannelPublicationScheduleSettings", () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([schedule]);
    mocks.getAssignment.mockReset().mockResolvedValue(null);
    mocks.assign.mockReset().mockResolvedValue({
      id: "assignment-1",
      channelId: "channel-1",
      scheduleId: schedule.id,
      selectionMode: "SUBSET",
      selectedSlotIds: ["slot-1"],
      schedule,
      updatedAt: "2026-09-14T00:00:00.000Z",
    });
    mocks.pushToast.mockReset();
  });

  it("shows the schedule avatar and always assigns manually selected slots", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSettings(onChange);

    await user.click(
      await screen.findByRole("button", { name: "Select schedule" }),
    );
    await user.click(
      screen.getByRole("button", { name: /Main Publications Plan/ }),
    );

    const selectedSchedule = screen.getByRole("button", {
      name: /Main Publications Plan/,
    });
    expect(selectedSchedule).toHaveTextContent("🍃");
    expect(screen.queryByText("Assignment")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Morning post/ }),
    ).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Ad post/ })).toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: /Ad post/ }));
    expect(
      screen.queryByRole("button", { name: "Assign schedule" }),
    ).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith({
      scheduleId: "schedule-1",
      selectedSlotIds: ["slot-1"],
    });
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});

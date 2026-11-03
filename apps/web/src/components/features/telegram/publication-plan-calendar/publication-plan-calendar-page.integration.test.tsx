import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { PublicationPlanCalendarPage } from "./publication-plan-calendar-page";

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/layout/page-tab-head", () => ({
  PageTabHead: () => null,
}));
vi.mock("@/components/features/telegram/publication-plan-calendar/publication-calendar-event-editor", () => ({
  PublicationCalendarEventEditor: () => null,
}));
vi.mock("@/hooks/use-workspace-timezone", () => ({
  useWorkspaceTimezone: () => "UTC",
}));
vi.mock("@/lib/api", () => ({
  telegramPublicationSchedulesApi: {
    list: vi.fn(),
    calendar: vi.fn(),
  },
}));

const listMock = vi.mocked(telegramPublicationSchedulesApi.list);
const calendarMock = vi.mocked(telegramPublicationSchedulesApi.calendar);

beforeEach(() => {
  listMock.mockReset();
  calendarMock.mockReset();
});

describe("PublicationPlanCalendarPage loading", () => {
  it("requests default calendar occupancy while the schedule list is still pending", async () => {
    let resolveSchedules!: (schedules: Awaited<ReturnType<typeof listMock>>) => void;
    let resolveCalendar!: (
      calendar: Awaited<ReturnType<typeof calendarMock>>,
    ) => void;
    let scheduleListResolved = false;
    listMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSchedules = (schedules) => {
          scheduleListResolved = true;
          resolve(schedules);
        };
      }),
    );
    calendarMock.mockReturnValue(
      new Promise((resolve) => {
        resolveCalendar = resolve;
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { unmount } = render(
      <QueryClientProvider client={client}>
        <PublicationPlanCalendarPage />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(calendarMock).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      ),
    );
    expect(scheduleListResolved).toBe(false);

    resolveSchedules([]);
    resolveCalendar({
      scheduleId: null,
      channelIds: [],
      occurrencesByChannel: {},
      events: [],
    });
    unmount();
    client.clear();
  });
});

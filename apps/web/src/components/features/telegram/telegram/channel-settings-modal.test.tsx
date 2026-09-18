import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelSettingsModal } from "./channel-settings-modal";

const mocks = vi.hoisted(() => ({
  analyticsSources: vi.fn(),
  updateQuiet: vi.fn(),
  getScheduleAssignment: vi.fn(),
  assignSchedule: vi.fn(),
  startOperation: vi.fn(),
  operationSucceed: vi.fn(),
  operationFail: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    telegramChannelsApi: {
      ...actual.telegramChannelsApi,
      analyticsSources: mocks.analyticsSources,
      updateQuiet: mocks.updateQuiet,
    },
    telegramPublicationSchedulesApi: {
      ...actual.telegramPublicationSchedulesApi,
      getAssignment: mocks.getScheduleAssignment,
      assignQuiet: mocks.assignSchedule,
    },
  };
});
vi.mock("./channel-presentation-settings-modal", () => ({
  ChannelPresentationSettingsModal: ({
    draft,
    onDraftChange,
  }: {
    draft: { tgStatUrl: string };
    onDraftChange: (patch: { tgStatUrl: string }) => void;
  }) => (
    <label>
      Appearance URL
      <input
        value={draft.tgStatUrl}
        onChange={(event) => onDraftChange({ tgStatUrl: event.target.value })}
      />
    </label>
  ),
}));
vi.mock("./channel-economics-editor", () => ({
  ChannelEconomicsEditor: ({
    draft,
    onDraftChange,
  }: {
    draft: { adBaseCpm: string; internalCpm: string };
    onDraftChange: (patch: {
      adBaseCpm?: string;
      internalCpm?: string;
    }) => void;
  }) => (
    <>
      <label>
        Draft CPM
        <input
          value={draft.adBaseCpm}
          onChange={(event) => onDraftChange({ adBaseCpm: event.target.value })}
        />
      </label>
      <label>
        Draft internal CPM
        <input
          value={draft.internalCpm}
          onChange={(event) =>
            onDraftChange({ internalCpm: event.target.value })
          }
        />
      </label>
    </>
  ),
}));
vi.mock("./channel-system-bot-access-modal", () => ({
  ChannelSystemBotAccessModal: () => <div>Bot settings content</div>,
}));
vi.mock("./channel-publication-schedule-settings", () => ({
  ChannelPublicationScheduleSettings: ({
    onChange,
  }: {
    onChange: (value: {
      scheduleId: string;
      selectedSlotIds: string[];
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ scheduleId: "schedule-1", selectedSlotIds: ["slot-1"] })
      }
    >
      Choose schedule slots
    </button>
  ),
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ startOperation: mocks.startOperation }),
}));

describe("ChannelSettingsModal", () => {
  beforeEach(() => {
    mocks.startOperation.mockReset().mockReturnValue({
      succeed: mocks.operationSucceed,
      fail: mocks.operationFail,
    });
    mocks.operationSucceed.mockReset();
    mocks.operationFail.mockReset();
  });

  it("saves schedule slots with the single modal Save button", async () => {
    mocks.analyticsSources.mockResolvedValue({ sources: [] });
    mocks.updateQuiet.mockResolvedValue({});
    mocks.getScheduleAssignment.mockResolvedValue(null);
    mocks.assignSchedule.mockReset().mockResolvedValue({});
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ChannelSettingsModal
          channel={{ id: "channel-1", title: "Business" } as never}
          initialTab="schedule"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Assign schedule" }),
    ).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Choose schedule slots" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.assignSchedule).toHaveBeenCalledWith("channel-1", {
        scheduleId: "schedule-1",
        selectionMode: "SUBSET",
        selectedSlotIds: ["slot-1"],
      }),
    );
    expect(mocks.startOperation).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Applying channel settings…" }),
    );
    expect(mocks.operationSucceed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Your changes were saved successfully.",
      }),
    );
  });

  it("groups channel configuration into icon-labelled tabs and shows the channel avatar", async () => {
    mocks.analyticsSources.mockReset().mockResolvedValue({ sources: [] });
    mocks.updateQuiet.mockReset().mockResolvedValue({});
    mocks.getScheduleAssignment.mockReset().mockResolvedValue(null);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ChannelSettingsModal
          channel={
            {
              id: "channel-1",
              title: "Business patterns",
              username: "business_patterns",
              shortDescription: "Business media about practical growth",
              photoUrl: "https://cdn.test/channel.jpg",
              presentationIconId: "icon-1",
              tgStatUrl: "https://tgstat.com/channel/test",
              defaultInviteLinkId: "invite-1",
              botInviteLinkId: "invite-bot",
              broadcastInviteLinkId: "invite-broadcast",
              audienceTransferInviteLinkId: "invite-transfer",
              folderDefaultInviteLinkIds: ["invite-folder"],
              mutualPromotionInviteLinkIds: ["invite-vp"],
              adBaseCpm: 300,
              internalCpm: 200,
              seedSubscribersCount: 100,
              autoSyncEnabled: true,
              preview: {
                sourcesCount: 1,
                systemBotConnection: {
                  connected: true,
                  status: "CONNECTED",
                },
              },
            } as never
          }
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByAltText("Business patterns")).toHaveAttribute(
      "src",
      "https://cdn.test/channel.jpg",
    );
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Appearance URL")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("67%")).toBeInTheDocument());
    expect(screen.getAllByTitle("Fully configured")).toHaveLength(3);
    expect(screen.getAllByTitle("Partially configured")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Schedule" })).toContainElement(
      screen.getByTitle("Not configured"),
    );
    expect(
      screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label")),
    ).toEqual([
      "Appearance",
      "Economics",
      "Schedule",
      "Seed",
      "Bot",
      "Sources",
    ]);

    await userEvent.click(screen.getByRole("tab", { name: "Economics" }));
    expect(screen.getByLabelText("Draft CPM")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Seed" }));
    expect(screen.getByText("Own / seed subscribers")).toBeInTheDocument();
  });

  it("keeps one draft across tabs and saves no-seed together with other settings", async () => {
    mocks.analyticsSources.mockReset().mockResolvedValue({ sources: [] });
    mocks.updateQuiet.mockReset().mockResolvedValue({});
    mocks.getScheduleAssignment.mockReset().mockResolvedValue(null);
    const onClose = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ChannelSettingsModal
          channel={
            {
              id: "channel-1",
              title: "Business patterns",
              tgStatUrl: "https://tgstat.com/old",
              adBaseCpm: 300,
              preview: { sourcesCount: 0 },
            } as never
          }
          onClose={onClose}
        />
      </QueryClientProvider>,
    );

    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
    const appearanceUrl = screen.getByLabelText("Appearance URL");
    await userEvent.clear(appearanceUrl);
    await userEvent.type(appearanceUrl, "https://tgstat.com/new");

    await userEvent.click(screen.getByRole("tab", { name: "Economics" }));
    const cpm = screen.getByLabelText("Draft CPM");
    await userEvent.clear(cpm);
    await userEvent.type(cpm, "450");
    const internalCpm = screen.getByLabelText("Draft internal CPM");
    await userEvent.type(internalCpm, "175");
    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByLabelText("Appearance URL")).toHaveValue(
      "https://tgstat.com/new",
    );

    await userEvent.click(screen.getByRole("tab", { name: "Seed" }));
    await userEvent.click(screen.getByRole("button", { name: "No seed" }));
    expect(screen.queryByText("Own / seed subscribers")).toBeNull();
    expect(screen.getByText(/marked as configured/)).toBeInTheDocument();
    expect(
      screen
        .getByRole("tab", { name: "Seed" })
        .querySelector('[title="Fully configured"]'),
    ).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(mocks.updateQuiet).toHaveBeenCalledOnce());
    expect(mocks.updateQuiet).toHaveBeenCalledWith(
      "channel-1",
      expect.objectContaining({
        tgStatUrl: "https://tgstat.com/new",
        adBaseCpm: 450,
        internalCpm: 175,
        seedDisabled: true,
        seedSubscribersCount: 0,
        knownFakeSubscribersCount: 0,
        ownViewsPerPost: 0,
        ownReactionsPerPost: 0,
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("changes the settings operation to an error and keeps the modal open", async () => {
    mocks.analyticsSources.mockReset().mockResolvedValue({ sources: [] });
    mocks.updateQuiet.mockReset().mockRejectedValue(new Error("offline"));
    mocks.getScheduleAssignment.mockReset().mockResolvedValue(null);
    const onClose = vi.fn();
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ChannelSettingsModal
          channel={{ id: "channel-1", title: "Business" } as never}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.operationFail).toHaveBeenCalledOnce());
    expect(mocks.operationFail).toHaveBeenCalledWith({
      title: "Could not save channel settings",
      message: "Check the settings and try again.",
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Channel settings" }),
    ).toBeVisible();
  });

  it("edits and saves the channel post sync limit from Sources", async () => {
    mocks.analyticsSources.mockReset().mockResolvedValue({ sources: [] });
    mocks.updateQuiet.mockReset().mockResolvedValue({});
    mocks.getScheduleAssignment.mockReset().mockResolvedValue(null);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <ChannelSettingsModal
          channel={
            {
              id: "channel-1",
              title: "Business patterns",
              postSyncLimit: 250,
              preview: { sourcesCount: 0 },
            } as never
          }
          initialTab="sources"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const input = await screen.findByRole("spinbutton", {
      name: "Posts to sync",
    });
    expect(input).toHaveValue(250);
    expect(input).toHaveAttribute("max", "10000");
    fireEvent.change(input, { target: { value: "750" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.updateQuiet).toHaveBeenCalledOnce());
    expect(mocks.updateQuiet).toHaveBeenCalledWith(
      "channel-1",
      expect.objectContaining({ postSyncLimit: 750 }),
    );
  });
});

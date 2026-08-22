import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelAutoSyncToggle } from "./channel-auto-sync-toggle";

const mocks = vi.hoisted(() => ({
  mutation: undefined as any,
  updateQuiet: vi.fn(),
  pushToast: vi.fn(),
  cancel: vi.fn(),
  snapshots: vi.fn(() => [[["telegram-channels", "list", "all"], []]]),
  patch: vi.fn(),
  restore: vi.fn(),
  pending: false,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useMutation: (options: any) => {
    mocks.mutation = options;
    return {
      mutate: (value: boolean) => options.mutationFn(value),
      isPending: mocks.pending,
    };
  },
}));
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { updateQuiet: mocks.updateQuiet },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.pushToast }),
}));
vi.mock("@/lib/features/telegram/telegram-channel-cache", () => ({
  cancelTelegramChannelCacheUpdates: mocks.cancel,
  getTelegramChannelCacheSnapshots: mocks.snapshots,
  patchTelegramChannelCaches: mocks.patch,
  restoreTelegramChannelCacheSnapshots: mocks.restore,
}));

describe("ChannelAutoSyncToggle", () => {
  beforeEach(() => {
    mocks.updateQuiet.mockReset();
    mocks.pushToast.mockReset();
    mocks.cancel.mockReset();
    mocks.snapshots.mockClear();
    mocks.patch.mockReset();
    mocks.restore.mockReset();
    mocks.pending = false;
  });

  it("updates list and detail caches from the PATCH response without a list GET", async () => {
    mocks.updateQuiet.mockResolvedValue({
      id: "channel-1",
      autoSyncEnabled: false,
    });
    render(<ChannelAutoSyncToggle channelId="channel-1" enabled />);

    await userEvent.click(screen.getByRole("button", { name: "Auto sync" }));

    expect(mocks.updateQuiet).toHaveBeenCalledWith("channel-1", {
      autoSyncEnabled: false,
    });
    await mocks.mutation.onMutate(false);
    expect(mocks.cancel).toHaveBeenCalledWith({}, "channel-1");
    expect(mocks.patch).toHaveBeenCalledWith(
      {},
      { id: "channel-1", autoSyncEnabled: false },
    );
    mocks.mutation.onSuccess({ id: "channel-1", autoSyncEnabled: false });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      {},
      { id: "channel-1", autoSyncEnabled: false },
    );
  });

  it("keeps server-backed state and shows feedback when the mutation fails", () => {
    render(<ChannelAutoSyncToggle channelId="channel-1" enabled={false} />);
    const snapshots = [[["telegram-channels", "list", "all"], []]];
    mocks.mutation.onError(
      { response: { data: { message: "Update denied" } } },
      false,
      { snapshots },
    );

    expect(screen.getByRole("button", { name: "Auto sync" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(mocks.restore).toHaveBeenCalledWith({}, snapshots);
    expect(mocks.pushToast).toHaveBeenCalledWith("Update denied", "error");
  });

  it("serializes rapid toggles while a request is pending", () => {
    mocks.pending = true;
    render(<ChannelAutoSyncToggle channelId="channel-1" enabled />);

    expect(screen.getByRole("button", { name: "Auto sync" })).toBeDisabled();
  });

  it("anchors the enabled thumb to the right inset", () => {
    render(<ChannelAutoSyncToggle channelId="channel-1" enabled />);

    expect(
      screen.getByRole("button", { name: "Auto sync" }).firstElementChild,
    ).toHaveClass("inset-y-0.5", "right-0.5");
  });

  it("anchors its tooltip to the toggle button rather than the label", () => {
    render(<ChannelAutoSyncToggle channelId="channel-1" enabled />);

    expect(
      screen.getByRole("button", { name: "Auto sync" }).parentElement,
    ).toHaveClass("max-w-72");
  });

  it("renders its tooltip above the actions menu layer", async () => {
    render(<ChannelAutoSyncToggle channelId="channel-1" enabled />);

    await userEvent.hover(screen.getByRole("button", { name: "Auto sync" }));

    expect(
      await screen.findByText(
        "Automatic analytics and data sync. Manual sync remains available.",
      ),
    ).toHaveClass("z-[200]");
  });
});

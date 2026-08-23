import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramChannelsApi } from "@/lib/api";
import { CalendarPlanImport } from "./calendar-plan-import";

const pushToast = vi.fn();

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { calendarPlanInstruction: vi.fn() },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast }),
}));

describe("CalendarPlanImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads the server-generated GPT planner instruction", async () => {
    vi.mocked(telegramChannelsApi.calendarPlanInstruction).mockResolvedValue(
      new Blob(["instruction"]),
    );
    const createObjectUrl = vi.fn(() => "blob:instruction");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
    let downloadedName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloadedName = this.download;
    });

    render(
      <CalendarPlanImport
        channelId="channel-1"
        channelTitle="Business"
        posts={[{ id: "post-1", title: "Post" }]}
        timezone="Europe/Warsaw"
        disabled={false}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.queryByText("Copy GPT format")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Download GPT instruction" }),
    );

    await waitFor(() =>
      expect(telegramChannelsApi.calendarPlanInstruction).toHaveBeenCalledWith(
        "channel-1",
      ),
    );
    expect(downloadedName).toMatch(
      /^BU_\d{2}-\d{2}_calendar-plan-instruction\.txt$/,
    );
    expect(createObjectUrl).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:instruction");
    expect(pushToast).toHaveBeenCalledWith(
      "GPT planner instruction downloaded.",
      "success",
    );
  });

  it("keeps the download action recoverable when instruction generation fails", async () => {
    vi.mocked(telegramChannelsApi.calendarPlanInstruction).mockRejectedValue(
      new Error("unavailable"),
    );

    render(
      <CalendarPlanImport
        channelId="channel-1"
        channelTitle="Business"
        posts={[]}
        timezone="Europe/Warsaw"
        disabled={false}
        onPreview={vi.fn()}
      />,
    );

    const download = screen.getByRole("button", {
      name: "Download GPT instruction",
    });
    fireEvent.click(download);

    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        "Could not download GPT planner instruction.",
        "error",
      ),
    );
    expect(download).toBeEnabled();
  });
});

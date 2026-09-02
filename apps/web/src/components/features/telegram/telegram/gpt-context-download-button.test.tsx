import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GptContextDownloadButton } from "./gpt-context-download-button";

const mocks = vi.hoisted(() => ({
  gptContext: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { gptContext: mocks.gptContext },
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.pushToast }),
}));

describe("GptContextDownloadButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:gpt-context"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("shows button dots without a loading toast and then reports success", async () => {
    let finishDownload: ((blob: Blob) => void) | undefined;
    mocks.gptContext.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finishDownload = resolve;
      }),
    );
    render(
      <GptContextDownloadButton channelId="channel-1" channelTitle="Channel" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Context$/i }));

    expect(screen.getByRole("button", { name: /^Context$/i })).toBeDisabled();
    expect(
      screen.getByRole("status", { name: "Downloading context" }),
    ).toBeInTheDocument();
    expect(mocks.pushToast).not.toHaveBeenCalled();

    finishDownload?.(new Blob(["context"]));

    await waitFor(() =>
      expect(mocks.pushToast).toHaveBeenCalledWith(
        "Context downloaded.",
        "success",
      ),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports only the final error and restores the button", async () => {
    mocks.gptContext.mockRejectedValue(new Error("Download failed"));
    render(
      <GptContextDownloadButton channelId="channel-1" channelTitle="Channel" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Context$/i }));

    await waitFor(() =>
      expect(mocks.pushToast).toHaveBeenCalledWith(
        "Something went wrong. Please try again.",
        "error",
      ),
    );
    expect(mocks.pushToast).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^Context$/i })).toBeEnabled();
  });
});

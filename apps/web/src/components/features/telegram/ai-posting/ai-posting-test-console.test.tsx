import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { renderWithProviders } from "@/test/render-with-providers";
import { AiPostingTestConsole } from "./ai-posting-test-console";

vi.mock("@/lib/api", () => ({
  API_MUTATION_EVENT: "test:api-mutation",
  api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock(
  "@/components/features/telegram/telegram/telegram-post-preview",
  () => ({
    TelegramPostPreview: () => <div data-testid="telegram-preview" />,
  }),
);

describe("AiPostingTestConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({
      data: { runId: "run-1", generated: [] },
    });
  });

  it("runs real three-publication generation for saved settings", async () => {
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Сгенерировать 3 публикации",
      }),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/telegram-channels/channel-1/ai-posting/generate",
        { count: 3 },
      ),
    );
  });

  it("requires persisted settings before starting a test run", async () => {
    renderWithProviders(
      <AiPostingTestConsole
        channelId="channel-1"
        channelTitle="Channel"
        settingsReady={false}
      />,
    );

    expect(
      await screen.findByRole("button", {
        name: "Сгенерировать 3 публикации",
      }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});

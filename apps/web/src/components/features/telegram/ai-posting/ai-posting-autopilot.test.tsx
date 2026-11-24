import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TelegramAiPostingAutopilotState } from "@telegram-system/shared";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/test/render-with-i18n";
import { AiPostingAutopilot } from "./ai-posting-autopilot";

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));

const settings: TelegramAiPostingAutopilotState = {
  enabled: false,
  weeklySlotsMin: 21,
  weeklySlotsMax: 28,
  drafts: 117,
  draftsToGenerate: 138,
  readyDrafts: 12,
  targetReadyDrafts: 150,
  automaticGenerationAvailable: false,
  activeStage: null,
  activeRunId: null,
  history: [],
  nextRunAt: null,
  scheduledThrough: null,
  lastStatus: null,
  lastError: null,
  lastRun: null,
};

function renderPanel(data: TelegramAiPostingAutopilotState) {
  api.get.mockResolvedValue({ data });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  renderWithI18n(
    <QueryClientProvider client={client}>
      <AiPostingAutopilot channelId="channel" />
    </QueryClientProvider>,
  );
}

describe("AI Posting Autopilot", () => {
  it("shows a single draft count and reflects both toggle responses from the server", async () => {
    api.put
      .mockResolvedValueOnce({ data: { ...settings, enabled: true } })
      .mockResolvedValueOnce({ data: settings });
    renderPanel(settings);
    expect(await screen.findByText("12 / 150")).toBeVisible();
    const enable = screen.getByRole("button", { name: "Enable Autopilot" });
    expect(enable).toBeEnabled();
    expect(screen.getByText("21–28")).toBeVisible();
    expect(screen.queryByText(/Autopilot is (?:on|off)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Drafts in editor/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Still to generate/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Operations → AI/)).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(enable);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        "/telegram-channels/channel/ai-posting/autopilot",
        { enabled: true },
      ),
    );
    const disable = await screen.findByRole("button", {
      name: "Disable Autopilot",
    });
    expect(screen.queryByText(/Autopilot is (?:on|off)/)).not.toBeInTheDocument();
    await user.click(disable);
    expect(
      await screen.findByRole("button", { name: "Enable Autopilot" }),
    ).toBeEnabled();
    expect(api.put).toHaveBeenLastCalledWith(
      "/telegram-channels/channel/ai-posting/autopilot",
      { enabled: false },
    );
    expect(screen.queryByText(/Autopilot is (?:on|off)/)).not.toBeInTheDocument();
  });

  it("explains that an assigned plan is required before activation", async () => {
    renderPanel({ ...settings, weeklySlotsMin: 0, weeklySlotsMax: 0 });
    expect(
      await screen.findByText(
        "Assign a publication plan with active content slots to this channel.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Enable Autopilot" }),
    ).toBeDisabled();
    expect(screen.getByText("No runs yet.")).toBeVisible();
  });

  it("refreshes the current stage into a finished run and shows the next plan", async () => {
    const time = "2026-11-24T15:00:00.000Z";
    const run = {
      id: "active-run",
      status: "RUNNING",
      startedAt: time,
      completedAt: null,
      errorCodes: [],
      summary: null,
      stages: [{ id: "stage", stage: "GENERATE_DRAFTS", startedAt: time, targetCount: 4 }],
    };
    const enabled = { ...settings, enabled: true, automaticGenerationAvailable: true, nextRunAt: time };
    renderPanel({ ...enabled, activeStage: "GENERATE_DRAFTS", activeRunId: run.id, history: [run] });
    expect(await screen.findByRole("region", { name: "Activity history" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Target 4");
    expect(screen.queryByText(/Next check/)).not.toBeInTheDocument();

    api.get.mockResolvedValue({ data: {
      ...enabled,
      history: [{ ...run, status: "PARTIAL", completedAt: time, errorCodes: ["AI_API_UNAVAILABLE"], summary: { generated: 2, scheduled: 1 } }],
    } });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("AI service unavailable.")).toBeVisible();
    expect(screen.getByText(/Partially completed/)).toBeVisible();
    expect(screen.getByText(/Next check/)).toBeVisible();
    expect(screen.getByText(/Replenishes the draft stock/)).toBeVisible();
  });
});

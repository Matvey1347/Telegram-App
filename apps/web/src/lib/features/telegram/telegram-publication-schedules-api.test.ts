import { describe, expect, it, vi } from "vitest";
import { createTelegramPublicationSchedulesApi } from "./telegram-publication-schedules-api";

describe("telegram publication schedules api", () => {
  it("uses the workspace schedule and channel assignment contracts", async () => {
    const http = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: { id: "s1" } }),
      put: vi.fn().mockResolvedValue({ data: { id: "a1" } }),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const client = createTelegramPublicationSchedulesApi(http as never);
    await client.list();
    await client.create({
      name: "Plan",
      iconId: "icon-1",
      slots: [{ title: "Post", kind: "CONTENT", time: "09:00" }],
    });
    await client.assign("c1", {
      scheduleId: "s1",
      selectionMode: "SUBSET",
      selectedSlotIds: ["slot1"],
    });
    expect(http.get).toHaveBeenCalledWith("/telegram-publication-schedules");
    expect(http.post).toHaveBeenCalledWith(
      "/telegram-publication-schedules",
      expect.objectContaining({ name: "Plan" }),
    );
    expect(http.put).toHaveBeenCalledWith(
      "/telegram-channels/c1/publication-schedule",
      { scheduleId: "s1", selectionMode: "SUBSET", selectedSlotIds: ["slot1"] },
    );
  });

  it("supports a silent assignment for a shared operation toast", async () => {
    const http = {
      put: vi.fn().mockResolvedValue({ data: { id: "a1" } }),
    };
    const silentFeedbackConfig = { headers: { "x-skip-feedback": "true" } };
    const client = createTelegramPublicationSchedulesApi(
      http as never,
      silentFeedbackConfig,
    );

    await client.assignQuiet("c1", {
      scheduleId: "s1",
      selectionMode: "SUBSET",
      selectedSlotIds: ["slot1"],
    });

    expect(http.put).toHaveBeenCalledWith(
      "/telegram-channels/c1/publication-schedule",
      { scheduleId: "s1", selectionMode: "SUBSET", selectedSlotIds: ["slot1"] },
      silentFeedbackConfig,
    );
  });
});

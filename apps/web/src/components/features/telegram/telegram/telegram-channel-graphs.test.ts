import { describe, expect, it } from "vitest";
import {
  hasRenderableTelegramGraphItem,
  normalizeStoredTelegramGraph,
  normalizeTelegramGraph,
} from "./telegram-channel-graphs";

describe("telegram channel graph normalization", () => {
  it("normalizes Telegram graph columns and timestamp units", () => {
    const chart = normalizeTelegramGraph({
      status: "available",
      data: JSON.stringify({
        columns: [
          ["x", 1_730_000_000, 1_730_003_600],
          ["views", 10, 20],
        ],
        names: { views: "Views" },
        colors: { views: "#123abc" },
        types: { views: "line" },
      }),
    });

    expect(chart?.rows).toEqual([
      { timestamp: 1_730_000_000_000, views: 10 },
      { timestamp: 1_730_003_600_000, views: 20 },
    ]);
    expect(chart?.series).toEqual([
      { key: "views", name: "Views", color: "#123abc", type: "line" },
    ]);
    expect(hasRenderableTelegramGraphItem({ chart })).toBe(true);
  });

  it("returns no chart for unavailable or malformed Telegram graph data", () => {
    expect(normalizeTelegramGraph({ status: "failed", data: {} })).toBeNull();
    expect(
      normalizeTelegramGraph({ status: "available", data: "not-json" }),
    ).toBeNull();
  });

  it("sorts stored graph points and ignores other metrics", () => {
    const chart = normalizeStoredTelegramGraph(
      [
        { metric: "views", date: "2026-01-02", series: "total", value: 12 },
        { metric: "subscribers", date: "2026-01-01", series: "total", value: 2 },
        { metric: "views", date: "2026-01-01", series: "total", value: 8 },
      ],
      "views",
    );

    expect(chart?.rows.map((row) => row.total)).toEqual([8, 12]);
    expect(chart?.rows[0].timestamp).toBeLessThan(chart?.rows[1].timestamp ?? 0);
  });
});

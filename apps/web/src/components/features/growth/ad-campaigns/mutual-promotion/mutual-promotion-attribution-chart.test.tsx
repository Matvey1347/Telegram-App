// @vitest-environment jsdom
import type { PropsWithChildren } from "react";
import type { MutualPromotionAttributionHistory } from "@telegram-system/shared";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MutualPromotionAttributionChart } from "./mutual-promotion-attribution-chart";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: PropsWithChildren) => <>{children}</>,
  LineChart: ({ children, data }: PropsWithChildren<{ data: unknown }>) => (
    <div data-testid="chart" data-points={JSON.stringify(data)}>{children}</div>
  ),
  Line: ({ name, dataKey }: { name: string; dataKey: string }) => (
    <span data-series={dataKey}>{name}</span>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

it("keeps joined visible when acquisition and churn cannot be measured", () => {
  const startsAt = "2026-11-20T09:00:00.000Z";
  const endsAt = "2026-11-21T09:00:00.000Z";
  const history: MutualPromotionAttributionHistory = {
    startsAt,
    endsAt,
    endsAtSource: "FINAL_CAPTURE",
    points: [
      { at: startsAt, joinedCount: 0, requestedCount: null, acquiredCount: null, unsubscribedCount: null, audienceDelta: null },
      { at: endsAt, joinedCount: 2, requestedCount: null, acquiredCount: null, unsubscribedCount: null, audienceDelta: null },
    ],
  };
  render(<MutualPromotionAttributionChart history={history} />);
  expect(screen.getByText("Joined")).toHaveAttribute("data-series", "joinedCount");
  expect(screen.getByText("Joined + requests")).toHaveAttribute("data-series", "acquiredCount");
  const points = JSON.parse(screen.getByTestId("chart").getAttribute("data-points") ?? "[]");
  expect(points.map(({ joinedCount, acquiredCount, unsubscribedCount }: typeof history.points[number]) =>
    [joinedCount, acquiredCount, unsubscribedCount],
  )).toEqual([[0, null, null], [2, null, null]]);
});

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { CrmAnalytics } from "./crm-analytics";

const analytics = vi.hoisted(() => ({
  data: {
    clients: 136,
    buyers: 8,
    conversionRate: 5.9,
    averagePaidOrderValue: "449.45",
    currency: "UAH",
    points: [],
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ isLoading: false, error: null, data: analytics.data }),
}));

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

describe("CrmAnalytics", () => {
  it("places buyer conversion before buyers and shows paid revenue per order", () => {
    render(<CrmAnalytics />);

    const labels = [
      "Unique clients",
      "Buyer conversion",
      "Buyers",
      "Average paid per order",
    ].map((label) => screen.getByText(label));

    for (let index = 1; index < labels.length; index += 1) {
      expect(labels[index - 1].compareDocumentPosition(labels[index])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
    expect(screen.getByText("449.45 UAH")).toBeVisible();
    expect(
      screen.getByText("Recorded payments divided by paid orders"),
    ).toBeVisible();
  });
});

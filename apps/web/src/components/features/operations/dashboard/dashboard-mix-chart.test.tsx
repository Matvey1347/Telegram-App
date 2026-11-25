import { fireEvent, render, screen, within } from "@testing-library/react";
import { Banknote, Wallet } from "lucide-react";
import { expect, it } from "vitest";
import { DashboardMixChart } from "./dashboard-mix-chart";

it("shows a segment's name, amount and share on pointer or keyboard focus", () => {
  const { container } = render(
    <DashboardMixChart
      title="Expenses"
      format={(amount) => `${amount} UAH`}
      percent={(value) => `${value}%`}
      segments={[
        { label: "Channels", value: 75, color: "#38bdf8", Icon: Wallet },
        { label: "Other", value: 25, color: "#a78bfa", Icon: Banknote },
      ]}
    />,
  );
  const circle = container.querySelectorAll("svg [data-segment]")[0];
  fireEvent.pointerOver(circle);
  const chart = within(screen.getByRole("region", { name: "Expenses" }));
  expect(chart.getAllByText("75 UAH")).toHaveLength(2);
  expect(circle).toHaveAttribute("stroke-width", "13");
  expect(container.querySelectorAll("svg [data-segment]")[1]).toHaveAttribute(
    "opacity",
    "0.38",
  );
  expect(container.querySelector(".pointer-events-none svg")).not.toBeNull();
  fireEvent.pointerOut(circle);
  fireEvent.focus(chart.getByText("Other").closest("[tabindex]")!);
  expect(chart.getAllByText("25%")).toHaveLength(2);
});

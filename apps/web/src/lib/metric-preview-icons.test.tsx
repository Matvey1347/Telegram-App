import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricPreviewLabel } from "./metric-preview-icons";

describe("MetricPreviewLabel", () => {
  it.each(["Spend", "Ad spend", "Expenses", "Cost"])(
    "uses the red expense indicator for %s",
    (label) => {
      const { container, unmount } = render(
        <MetricPreviewLabel label={label} />,
      );

      expect(screen.getByText(label)).toBeInTheDocument();
      expect(container.querySelector(".lucide-circle-minus")).toHaveClass(
        "text-rose-400",
      );
      unmount();
    },
  );
});

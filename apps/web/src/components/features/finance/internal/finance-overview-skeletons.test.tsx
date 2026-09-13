import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import {
  TransactionRowsSkeleton,
  TransferRowsSkeleton,
} from "./finance-overview-skeletons";

describe("finance overview list skeletons", () => {
  it.each([
    ["transactions", TransactionRowsSkeleton],
    ["transfers", TransferRowsSkeleton],
  ] as const)(
    "shows only five %s placeholders on mobile while retaining ten on desktop",
    (label, SkeletonRows) => {
      render(<SkeletonRows count={10} />);

      const skeleton = screen.getByRole("status", {
        name: `Loading ${label}`,
      });
      const rows = skeleton.querySelectorAll("[data-skeleton-row]");

      expect(rows).toHaveLength(10);
      Array.from(rows)
        .slice(0, 5)
        .forEach((row) => expect(row).toHaveClass("grid"));
      Array.from(rows)
        .slice(5)
        .forEach((row) => expect(row).toHaveClass("hidden", "sm:grid"));
    },
  );
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdSaleOriginPreview } from "./ad-sale-origin";

describe("AdSaleOriginPreview", () => {
  it.each([
    ["DIRECT", "Internal"],
    ["DIRECT_EXTERNAL", "External"],
  ] as const)("shows the %s new-sale kind", (origin, kind) => {
    render(<AdSaleOriginPreview origin={origin} />);

    expect(screen.getByText("New sales")).toBeTruthy();
    expect(screen.getByText(kind)).toBeTruthy();
  });

  it.each(["REPEAT", "ADSELL_IO", "COLLABORATOR_PRO"] as const)(
    "does not add a kind badge to %s",
    (origin) => {
      const { container } = render(<AdSaleOriginPreview origin={origin} />);

      expect(container.textContent).not.toContain("Internal");
      expect(container.textContent).not.toContain("External");
    },
  );
});

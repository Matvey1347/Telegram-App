import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { AdSaleModalSummary } from "./ad-sale-modal-summary";

function renderSummary(overrides: Partial<Parameters<typeof AdSaleModalSummary>[0]> = {}) {
  return render(
    <AdSaleModalSummary
      advertiser="Example client"
      placementCount={2}
      dateLabel="2026-11-22"
      financeSkipped={false}
      amount={0}
      currency="UAH"
      submissionError={null}
      {...overrides}
    />,
  );
}

describe("AdSaleModalSummary", () => {
  it("shows the client avatar or person placeholder and keeps the summary focused", () => {
    const { container, rerender } = renderSummary({ clientAvatarUrl: "https://cdn.example/client.jpg" });

    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example/client.jpg",
    );
    expect(screen.queryByText("No financial transaction")).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow")).not.toBeInTheDocument();
    expect(screen.queryByText("Post")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment included")).not.toBeInTheDocument();

    rerender(
      <AdSaleModalSummary
        advertiser="Example client"
        placementCount={2}
        dateLabel="2026-11-22"
        financeSkipped={true}
        amount={0}
        currency="UAH"
        submissionError={null}
      />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("USER")).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
  });

  it("shows a zero amount as a payment when the transaction is enabled", () => {
    renderSummary();

    expect(screen.queryByText("Free")).toBeNull();
    expect(screen.getAllByText(/0\.00/).length).toBeGreaterThan(0);
  });
});

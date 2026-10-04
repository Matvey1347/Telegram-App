import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FinanceFeedbackProvider,
  useFinanceFeedback,
} from "./finance-feedback";
import financeStyles from "./finance-ui.module.css";

function FeedbackProbe() {
  const { pushToast } = useFinanceFeedback();
  return (
    <button
      type="button"
      onClick={() => {
        pushToast("Saved", "success");
        pushToast("Saved", "success");
      }}
    >
      Notify
    </button>
  );
}

describe("FinanceFeedbackProvider", () => {
  it("deduplicates identical product feedback inside the compatibility window", () => {
    render(
      <FinanceFeedbackProvider>
        <FeedbackProbe />
      </FinanceFeedbackProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Notify" }));

    expect(screen.getAllByText("Saved")).toHaveLength(1);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      document.getElementById("consumer-finance-notifications"),
    ).toHaveClass(financeStyles.themeRoot, financeStyles.toastHost);
  });
});

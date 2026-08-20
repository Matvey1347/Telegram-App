import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryContentState } from "./query-content-state";

function renderState(
  overrides: Partial<React.ComponentProps<typeof QueryContentState>> = {},
) {
  return render(
    <QueryContentState
      isLoading={false}
      isError={false}
      isEmpty
      loadingText="Loading records"
      errorText="Records failed"
      emptyText="No records"
      {...overrides}
    >
      <div>Records content</div>
    </QueryContentState>,
  );
}

describe("QueryContentState", () => {
  it("shows only the error when a failed query has no data", () => {
    renderState({ isError: true });

    expect(screen.getByText("Records failed")).toBeInTheDocument();
    expect(screen.queryByText("No records")).not.toBeInTheDocument();
    expect(screen.queryByText("Records content")).not.toBeInTheDocument();
  });

  it("gives initial loading precedence over error and empty states", () => {
    renderState({ isLoading: true, isError: true });

    expect(screen.getByLabelText("Loading records")).toBeInTheDocument();
    expect(screen.queryByText("Records failed")).not.toBeInTheDocument();
    expect(screen.queryByText("No records")).not.toBeInTheDocument();
  });

  it("keeps existing content visible during a failed background refresh", () => {
    renderState({ isError: true, isEmpty: false });

    expect(screen.getByText("Records content")).toBeInTheDocument();
    expect(screen.queryByText("Records failed")).not.toBeInTheDocument();
  });

  it("shows the empty state after a successful empty response", () => {
    renderState();

    expect(screen.getByText("No records")).toBeInTheDocument();
  });

  it("offers an explicit retry for an initial query failure", async () => {
    const retry = vi.fn();
    renderState({ isError: true, onRetry: retry });

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});

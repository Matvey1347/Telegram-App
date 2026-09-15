import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceAnalytics } from "./finance-analytics";

const mocks = vi.hoisted(() => ({ analytics: vi.fn() }));

vi.mock("@/lib/features/finance/consumer-finance-api", () => ({
  consumerFinanceApi: { analytics: mocks.analytics },
}));
vi.mock("./finance-analytics-ai", () => ({
  FinanceAnalyticsAi: () => <div data-testid="analytics-ai" />,
}));
vi.mock("./finance-analytics-presentation", () => ({
  AnalyticsPresentation: ({ data }: { data: { marker: string } }) => (
    <div>{data.marker}</div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderAnalytics(client: QueryClient, period = "CURRENT_MONTH") {
  return render(
    <QueryClientProvider client={client}>
      <FinanceAnalytics
        botId="bot-1"
        locale="en"
        onUpgrade={() => undefined}
        period={{ period } as never}
      />
    </QueryClientProvider>,
  );
}

describe("FinanceAnalytics loading states", () => {
  beforeEach(() => mocks.analytics.mockReset());

  it("keeps the full loader for first load and uses a content-shaped skeleton when changing period", async () => {
    const first = deferred<{ marker: string }>();
    const second = deferred<{ marker: string }>();
    mocks.analytics
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderAnalytics(client);

    expect(
      document.querySelector("[data-finance-feedback='loading']"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-analytics-skeleton]"),
    ).not.toBeInTheDocument();

    await act(async () => first.resolve({ marker: "Current analytics" }));
    expect(await screen.findByText("Current analytics")).toBeInTheDocument();

    view.rerender(
      <QueryClientProvider client={client}>
        <FinanceAnalytics
          botId="bot-1"
          locale="en"
          onUpgrade={() => undefined}
          period={{ period: "PREVIOUS_MONTH" }}
        />
      </QueryClientProvider>,
    );

    expect(
      document.querySelector("[data-finance-analytics-skeleton]"),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-finance-feedback='loading']"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Current analytics")).not.toBeInTheDocument();

    await act(async () => second.resolve({ marker: "Previous analytics" }));
    await waitFor(() =>
      expect(screen.getByText("Previous analytics")).toBeInTheDocument(),
    );
  });
});

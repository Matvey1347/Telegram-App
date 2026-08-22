import { useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConsumerFinanceProvider } from "./consumer-finance-provider";

function CacheProbe() {
  const client = useQueryClient();
  const queries = client.getDefaultOptions().queries;
  return (
    <output data-testid="cache-policy">
      {JSON.stringify({
        staleTime: queries?.staleTime,
        gcTime: queries?.gcTime,
        keepsPreviousData: typeof queries?.placeholderData === "function",
        refetchOnWindowFocus: queries?.refetchOnWindowFocus,
        retry: queries?.retry,
      })}
    </output>
  );
}

describe("ConsumerFinanceProvider", () => {
  it("owns a non-persisted Finance query client with bounded defaults", () => {
    localStorage.setItem(
      "telegram-system-react-query-cache",
      JSON.stringify({ unrelated: true }),
    );

    render(
      <ConsumerFinanceProvider>
        <CacheProbe />
      </ConsumerFinanceProvider>,
    );

    expect(screen.getByTestId("cache-policy")).toHaveTextContent(
      JSON.stringify({
        staleTime: 240_000,
        gcTime: 2_700_000,
        keepsPreviousData: true,
        refetchOnWindowFocus: false,
        retry: 1,
      }),
    );
    expect(localStorage.getItem("telegram-system-react-query-cache")).toBe(
      JSON.stringify({ unrelated: true }),
    );
    expect(
      screen
        .getByTestId("cache-policy")
        .closest("[data-consumer-finance-theme]"),
    ).toHaveAttribute("data-consumer-finance-theme", "neutral-blue");
  });
});

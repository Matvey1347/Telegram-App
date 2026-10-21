import { dehydrate, QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ConsumerFinanceProvider,
  isPersistedConsumerFinanceQuery,
} from "./consumer-finance-provider";

function CacheProbe() {
  const client = useQueryClient();
  const queries = client.getDefaultOptions().queries;
  return (
    <output data-testid="cache-policy">
      {JSON.stringify({
        staleTime: queries?.staleTime,
        gcTime: queries?.gcTime,
        hasGlobalPlaceholder: queries?.placeholderData !== undefined,
        refetchOnWindowFocus: queries?.refetchOnWindowFocus,
        retry: queries?.retry,
      })}
    </output>
  );
}

function RestoredCacheProbe() {
  const client = useQueryClient();
  return (
    <output data-testid="restored-cache">
      {String(
        client.getQueryData<string>([
          "consumer-finance",
          "bot-a",
          "groshly-read-model",
        ]),
      )}
    </output>
  );
}

describe("ConsumerFinanceProvider", () => {
  it("uses short-lived persisted read models with bounded query defaults", () => {
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
        staleTime: 30_000,
        gcTime: 2_700_000,
        hasGlobalPlaceholder: false,
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

  it("persists finance read models but never session or payment state", () => {
    expect(
      isPersistedConsumerFinanceQuery([
        "consumer-finance",
        "bot-a",
        "accounts",
      ]),
    ).toBe(true);
    expect(
      isPersistedConsumerFinanceQuery([
        "consumer-finance",
        "bot-a",
        "session",
      ]),
    ).toBe(false);
    expect(
      isPersistedConsumerFinanceQuery([
        "consumer-finance",
        "bot-a",
        "entitlements",
      ]),
    ).toBe(false);
  });

  it("persists Groshly ledgers only with a verified Telegram identity scope", () => {
    expect(
      isPersistedConsumerFinanceQuery([
        "consumer-finance",
        "bot-a",
        "groshly-read-model",
      ]),
    ).toBe(false);
    expect(
      isPersistedConsumerFinanceQuery([
        "consumer-finance",
        "bot-a",
        "groshly-read-model",
        "telegram-user:42",
      ]),
    ).toBe(true);
    expect(
      isPersistedConsumerFinanceQuery([
        "consumer-finance",
        "bot-a",
        "groshly-obligations",
      ]),
    ).toBe(false);
  });

  it("invalidates legacy persisted Groshly ledgers", () => {
    const source = new QueryClient();
    source.setQueryData(
      ["consumer-finance", "bot-a", "groshly-read-model"],
      "available immediately",
    );
    localStorage.setItem(
      "consumer-finance-react-query-cache",
      JSON.stringify({
        buster: "consumer-finance-cache-v1",
        timestamp: Date.now(),
        clientState: dehydrate(source),
      }),
    );

    render(
      <ConsumerFinanceProvider>
        <RestoredCacheProbe />
      </ConsumerFinanceProvider>,
    );

    expect(screen.getByTestId("restored-cache")).toHaveTextContent("undefined");
  });

  it("does not expose cached data across bot-scoped query keys", () => {
    function BotIsolationProbe() {
      const client = useQueryClient();
      client.setQueryData(["consumer-finance", "bot-a", "accounts"], [
        { id: "account-a" },
      ]);
      return (
        <output data-testid="bot-b-cache">
          {JSON.stringify(
            client.getQueryData(["consumer-finance", "bot-b", "accounts"]) ??
              null,
          )}
        </output>
      );
    }

    render(
      <ConsumerFinanceProvider>
        <BotIsolationProbe />
      </ConsumerFinanceProvider>,
    );

    expect(screen.getByTestId("bot-b-cache")).toHaveTextContent("null");
  });
});

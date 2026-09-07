import { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import { queryRetryDelay, shouldRetryQuery } from "./development-query-retry";

describe("development query retry", () => {
  it("keeps read queries pending while the local API restarts", () => {
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");

    expect(shouldRetryQuery(20, networkError, true)).toBe(true);
    expect(queryRetryDelay(20, networkError, true)).toBe(1_500);
    expect(shouldRetryQuery(30, networkError, true)).toBe(false);
  });

  it("does not extend retries for server responses or production", () => {
    const serverError = new AxiosError(
      "Internal Server Error",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      { status: 500 } as never,
    );
    const networkError = new AxiosError("Network Error", "ERR_NETWORK");

    expect(shouldRetryQuery(1, serverError, true)).toBe(false);
    expect(shouldRetryQuery(1, networkError, false)).toBe(false);
  });
});

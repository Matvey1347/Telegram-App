import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("reset password locale hint", () => {
  it("makes a supported email locale available to SSR and persists it", () => {
    const response = proxy(
      new NextRequest(
        "https://app.example.test/reset-password?token=secret&locale=ru",
      ),
    );

    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "telegram-system-locale=ru",
    );
    expect(response.cookies.get("telegram-system-locale")?.value).toBe("ru");
  });

  it("ignores an unsupported locale hint", () => {
    const response = proxy(
      new NextRequest(
        "https://app.example.test/reset-password?token=secret&locale=invalid",
      ),
    );

    expect(response.cookies.get("telegram-system-locale")).toBeUndefined();
  });
});

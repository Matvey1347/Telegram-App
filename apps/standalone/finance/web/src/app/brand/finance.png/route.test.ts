import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("legacy Finance brand image route", () => {
  it("redirects the former logo URL to the current Groshly brand image", () => {
    const response = GET(new Request("https://finance.test/brand/finance.png"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://finance.test/brand/groshly-icon.png",
    );
  });
});

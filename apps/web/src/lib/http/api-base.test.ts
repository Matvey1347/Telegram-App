import { describe, expect, it } from "vitest";
import {
  resolveBrowserApiBase,
  type BrowserApiLocation,
} from "./api-base";

function browserLocation(url: string): BrowserApiLocation {
  const parsed = new URL(url);
  return {
    hostname: parsed.hostname,
    origin: parsed.origin,
    protocol: parsed.protocol,
  };
}

describe("resolveBrowserApiBase", () => {
  it("keeps the configured local API for a localhost web app", () => {
    expect(
      resolveBrowserApiBase(
        "http://localhost:4000",
        browserLocation("http://localhost:3000"),
      ),
    ).toBe("http://localhost:4000/api");
  });

  it.each([
    "https://temporary-gateway.example/finance/bot-1",
    "https://another-public-origin.example/finance/bot-2",
  ])(
    "uses same-origin /api when a public page receives a loopback build value: %s",
    (pageUrl) => {
      expect(
        resolveBrowserApiBase(
          "http://127.0.0.1:4000/api",
          browserLocation(pageUrl),
        ),
      ).toBe("/api");
    },
  );

  it("supports a separately deployed remote HTTPS API", () => {
    expect(
      resolveBrowserApiBase(
        "https://api.example.com/v1",
        browserLocation("https://app.example.com"),
      ),
    ).toBe("https://api.example.com/v1/api");
  });

  it("keeps Railway-style same-origin configuration relative", () => {
    expect(
      resolveBrowserApiBase(
        "/api",
        browserLocation("https://telegram-system.example"),
      ),
    ).toBe("/api");
  });

  it.each([undefined, "", "not a URL", "file:///tmp/api", "/"])(
    "uses a safe same-origin API for missing or malformed config: %s",
    (apiUrl) => {
      expect(resolveBrowserApiBase(apiUrl, undefined)).toBe("/api");
    },
  );
});

import { describe, expect, it } from "vitest";
import { isDevelopmentHost, systemBrandForHost } from "@/lib/app-brand";

describe("app brand", () => {
  it("uses dev assets only for loopback hosts", () => {
    expect(isDevelopmentHost("localhost")).toBe(true);
    expect(isDevelopmentHost("127.0.0.1")).toBe(true);
    expect(systemBrandForHost("localhost").favicon).toBe(
      "/brand/favicon-dev.png",
    );
  });

  it("uses production assets for configured public domains", () => {
    expect(isDevelopmentHost("www.nexeloq.com")).toBe(false);
    expect(systemBrandForHost("www.nexeloq.com").favicon).toBe(
      "/brand/favicon-prod.png",
    );
  });
});

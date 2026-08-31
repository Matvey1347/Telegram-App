import { describe, expect, it } from "vitest";
import { timezonePresentations } from "./timezones";

describe("timezonePresentations", () => {
  it("provides the complete maintained timezone list with flags and UTC offsets", () => {
    const timezones = timezonePresentations("Europe/Warsaw");
    const warsaw = timezones.find(({ value }) => value === "Europe/Warsaw");

    expect(timezones.length).toBeGreaterThan(300);
    expect(warsaw).toMatchObject({
      flag: "🇵🇱",
      country: "Poland",
    });
    expect(warsaw?.utc).toMatch(/^UTC[+−]\d{2}:\d{2}$/u);
    expect(timezones.find(({ value }) => value === "UTC")).toMatchObject({
      flag: "🌐",
      utc: "UTC",
    });
  });

  it("preserves a selected timezone that is not in the maintained list", () => {
    expect(
      timezonePresentations("Custom/Workspace").find(
        ({ value }) => value === "Custom/Workspace",
      ),
    ).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizePlannerFormatWeights,
  redistributePlannerFormatWeight,
} from "./telegram-planner-weights";

describe("telegram planner weights", () => {
  it("normalizes legacy independent percentages into one 100% distribution", () => {
    expect(
      normalizePlannerFormatWeights(["first", "second"], {
        first: 100,
        second: 50,
      }),
    ).toEqual({ first: 67, second: 33 });
  });

  it("redistributes the remaining percentage when one format changes", () => {
    const result = redistributePlannerFormatWeight(
      ["first", "second", "third"],
      { first: 50, second: 30, third: 20 },
      "first",
      30,
    );

    expect(result).toEqual({ second: 42, third: 28, first: 30 });
    expect(Object.values(result).reduce((sum, weight) => sum + weight, 0)).toBe(
      100,
    );
  });

  it("keeps a single format at 100%", () => {
    expect(
      redistributePlannerFormatWeight(["only"], { only: 10 }, "only", 0),
    ).toEqual({
      only: 100,
    });
  });
});

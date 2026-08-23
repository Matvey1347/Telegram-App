import { describe, expect, it } from "vitest";
import { parseCalendarPlanImport } from "./calendar-plan-import-model";

describe("parseCalendarPlanImport", () => {
  const posts = [{ id: "post-1", title: "First", groupId: "group-1" }];

  it("builds an editable planner preview from date and time", () => {
    const result = parseCalendarPlanImport(
      '[{"postId":"post-1","date":"2099-08-10","time":"09:30"}]',
      posts,
      "Europe/Warsaw",
      new Date("2099-01-01T00:00:00.000Z"),
    );
    expect(result.assignments[0]).toMatchObject({
      postId: "post-1",
      title: "First",
      date: "2099-08-10",
      groupId: "group-1",
    });
    expect(result.summary.plannedPosts).toBe(1);
  });

  it("rejects unknown posts and duplicate publishing times", () => {
    expect(() =>
      parseCalendarPlanImport(
        '[{"postId":"missing","scheduledAt":"2099-08-10T09:30:00Z"}]',
        posts,
        "UTC",
        new Date("2099-01-01T00:00:00Z"),
      ),
    ).toThrow("not available");
  });
});

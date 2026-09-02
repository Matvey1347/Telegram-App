import { fireEvent, screen } from "@testing-library/react";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { describe, expect, it, vi } from "vitest";
import { AutoCalendarPlannerPreview } from "./auto-calendar-planner-preview";

const preview = {
  from: "2099-08-10",
  to: "2099-08-11",
  timezone: "Europe/Warsaw",
  assignments: [
    {
      postId: "post-1",
      title: "First post",
      scheduledAt: "2099-08-10T07:30:00.000Z",
      date: "2099-08-10",
      slotId: "slot-1",
      formatId: "format-1",
      groupId: "group-1",
      provenance: {
        planner: "telegram_posts_auto_calendar" as const,
        reason: "matched_active_slot",
        slotId: "slot-1",
        formatId: "format-1",
        groupId: "group-1",
        generatedAt: "2099-08-01T00:00:00.000Z",
      },
    },
  ],
  summary: {
    eligiblePosts: 3,
    availableSlots: 2,
    plannedPosts: 1,
    unfilledSlots: 1,
  },
};

describe("AutoCalendarPlannerPreview", () => {
  it("makes preview-only behavior and explicit scheduling clear", () => {
    const onRerollDay = vi.fn();
    const onScheduleAll = vi.fn();
    render(
      <AutoCalendarPlannerPreview
        preview={preview}
        busy={false}
        rerollingDate={null}
        onRerollDay={onRerollDay}
        onScheduleAll={onScheduleAll}
      />,
    );

    expect(
      screen.getByText(/Nothing is scheduled until you confirm/i),
    ).toBeInTheDocument();
    expect(screen.getByText("First post")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reroll day/i }));
    expect(onRerollDay).toHaveBeenCalledWith("2099-08-10");

    fireEvent.click(
      screen.getByRole("button", { name: /Schedule all 1 posts/i }),
    );
    expect(onScheduleAll).toHaveBeenCalledOnce();
  });

  it("allows an imported assignment to be replaced or removed before scheduling", () => {
    const onRemoveAssignment = vi.fn();
    const onReplaceAssignmentPost = vi.fn();
    const onOpenPostInNewTab = vi.fn();
    render(
      <AutoCalendarPlannerPreview
        preview={preview}
        busy={false}
        rerollingDate={null}
        onScheduleAll={vi.fn()}
        availablePosts={[
          {
            id: "post-1",
            title: "First post",
            iconPresentation: { type: "unicode", value: "🧠" },
          },
          { id: "post-2", title: "Second post" },
        ]}
        onRemoveAssignment={onRemoveAssignment}
        onReplaceAssignmentPost={onReplaceAssignmentPost}
        onOpenPostInNewTab={onOpenPostInNewTab}
      />,
    );

    expect(screen.getAllByText("🧠").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Open First post in a new tab" }),
    );
    expect(onOpenPostInNewTab).toHaveBeenCalledWith("post-1");

    fireEvent.click(screen.getByRole("button", { name: "🧠 First post" }));
    fireEvent.click(screen.getByText("Second post"));
    expect(onReplaceAssignmentPost).toHaveBeenCalledWith(
      "post-1",
      "2099-08-10T07:30:00.000Z",
      "post-2",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove First post from plan" }),
    );
    expect(onRemoveAssignment).toHaveBeenCalledOnce();

    const removeButton = screen.getByRole("button", {
      name: "Remove First post from plan",
    });
    const scheduleButton = screen.getByRole("button", {
      name: /Schedule all 1 posts/i,
    });
    expect(
      removeButton.compareDocumentPosition(scheduleButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

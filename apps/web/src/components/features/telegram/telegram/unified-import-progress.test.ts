import { screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import type { TelegramUnifiedImportManifest } from "@telegram-system/shared";
import { renderWithI18n } from "@/test/render-with-i18n";
import {
  applyUnifiedImportProgressToManifest,
  reconcileUnifiedImportResult,
  UnifiedImportProgress,
} from "./unified-import-progress";

const manifest: TelegramUnifiedImportManifest = {
  version: 1,
  groups: [{ ref: "group-1", action: "CREATE", imported: false }],
  schedule: [
    {
      action: "SCHEDULE",
      postRef: "post-1",
      scheduledAt: "2026-09-17T08:10:00.000Z",
      imported: false,
    },
  ],
  delete: { posts: [{ id: "post-delete", imported: false }] },
};

describe("applyUnifiedImportProgressToManifest", () => {
  it("marks entity, calendar, and deletion operations as imported on success", () => {
    const groupImported = applyUnifiedImportProgressToManifest(manifest, {
      kind: "operation",
      section: "groups",
      status: "success",
      action: "CREATE",
      ref: "group-1",
      message: "created",
    });
    const scheduleImported = applyUnifiedImportProgressToManifest(
      groupImported,
      {
        kind: "operation",
        section: "schedule",
        status: "success",
        action: "SCHEDULE",
        ref: "post-1",
        message: "scheduled",
      },
    );
    const deletionImported = applyUnifiedImportProgressToManifest(
      scheduleImported,
      {
        kind: "operation",
        section: "deletions",
        status: "success",
        action: "DELETE",
        ref: "delete:post:post-delete",
        message: "deleted",
      },
    );

    expect(deletionImported.groups?.[0].imported).toBe(true);
    expect(deletionImported.schedule?.[0].imported).toBe(true);
    expect(deletionImported.delete?.posts?.[0].imported).toBe(true);
  });

  it("keeps failed operations pending", () => {
    const result = applyUnifiedImportProgressToManifest(manifest, {
      kind: "operation",
      section: "schedule",
      status: "failed",
      action: "SCHEDULE",
      ref: "post-1",
      message: "failed",
    });

    expect(result).toBe(manifest);
    expect(result.schedule?.[0].imported).toBe(false);
  });

  it("uses distinct semantic colors for every progress total", () => {
    renderWithI18n(
      createElement(UnifiedImportProgress, {
        status: "running",
        entries: [
          {
            current: 1,
            total: 1,
            item: {
              kind: "operation",
              section: "posts",
              status: "success",
              action: "CREATE",
              ref: "post-1",
              message: "created",
            },
          },
        ],
      }),
    );

    expect(screen.getByText("Created").nextElementSibling).toHaveClass(
      "text-emerald-400",
    );
    expect(screen.getByText("Updated").nextElementSibling).toHaveClass(
      "text-blue-400",
    );
    expect(screen.getByText("Deleted").nextElementSibling).toHaveClass(
      "text-rose-400",
    );
    expect(screen.getByText("Scheduled").nextElementSibling).toHaveClass(
      "text-violet-400",
    );
    expect(screen.getByText("Unscheduled").nextElementSibling).toHaveClass(
      "text-amber-400",
    );
    expect(screen.getByText("Errors").nextElementSibling).toHaveClass(
      "text-red-400",
    );
  });

  it("keeps a completed summary and operation results visible", () => {
    renderWithI18n(
      createElement(UnifiedImportProgress, {
        status: "completed-with-errors",
        entries: [
          {
            current: 1,
            total: 2,
            item: {
              kind: "operation",
              section: "posts",
              status: "success",
              action: "CREATE",
              ref: "post-1",
              message: "CREATE First post",
            },
          },
          {
            current: 2,
            total: 2,
            item: {
              kind: "operation",
              section: "schedule",
              status: "failed",
              action: "SCHEDULE",
              ref: "post-2",
              message: "SCHEDULE Second post failed: slot occupied",
            },
          },
        ],
      }),
    );

    expect(screen.getByText("Completed with errors")).toBeVisible();
    expect(screen.getByText("Successful").nextElementSibling).toHaveTextContent(
      "1",
    );
    expect(screen.getByText("Errors").nextElementSibling).toHaveTextContent(
      "1",
    );
    expect(screen.getByText("CREATE First post")).toBeVisible();
    expect(
      screen.getByText("SCHEDULE Second post failed: slot occupied"),
    ).toBeVisible();
  });

  it("shows a request failure even when the stream produced no operations", () => {
    renderWithI18n(
      createElement(UnifiedImportProgress, {
        status: "failed",
        entries: [],
        errorMessage: "Request failed with status code 400",
      }),
    );

    expect(screen.getByText("Failed")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Request failed with status code 400",
    );
  });
});

describe("reconcileUnifiedImportResult", () => {
  it("adds final API failures missing from the progress stream", () => {
    const entries = reconcileUnifiedImportResult([], {
      manifestHash: "result-hash",
      manifest,
      sections: [
        {
          key: "schedule",
          created: 0,
          updated: 0,
          deleted: 0,
          scheduled: 0,
          unscheduled: 0,
          failed: [{ ref: "post-1", error: "Slot occupied" }],
        },
      ],
    });

    expect(entries).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({
          status: "failed",
          message: "post-1: Slot occupied",
        }),
      }),
    ]);
  });
});

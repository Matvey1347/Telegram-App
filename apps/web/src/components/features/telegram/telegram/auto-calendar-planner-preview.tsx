"use client";

import type {
  ResolvedEmoji,
  TelegramPostPlannerPreviewResult,
} from "@telegram-system/shared";
import {
  CalendarCheck2,
  ExternalLink,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button, CustomSelect } from "@/components/ui/primitives";

type PlannerPostOption = {
  id: string;
  title: string;
  iconPresentation?: ResolvedEmoji | null;
};

export function AutoCalendarPlannerPreview({
  preview,
  busy,
  rerollingDate,
  onRerollDay,
  onScheduleAll,
  availablePosts,
  onRemoveAssignment,
  onReplaceAssignmentPost,
  onOpenPostInNewTab,
}: {
  preview: TelegramPostPlannerPreviewResult;
  busy: boolean;
  rerollingDate: string | null;
  onRerollDay?: (date: string) => void;
  onScheduleAll: () => void;
  availablePosts?: PlannerPostOption[];
  onRemoveAssignment?: (postId: string, scheduledAt: string) => void;
  onReplaceAssignmentPost?: (
    currentPostId: string,
    scheduledAt: string,
    nextPostId: string,
  ) => void;
  onOpenPostInNewTab?: (postId: string) => void;
}) {
  const assignmentsByDate = new Map<string, typeof preview.assignments>();
  for (const assignment of preview.assignments) {
    assignmentsByDate.set(assignment.date, [
      ...(assignmentsByDate.get(assignment.date) ?? []),
      assignment,
    ]);
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-blue-900/60 bg-blue-950/10 p-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Plan preview</h4>
        <p className="mt-0.5 text-xs text-neutral-400">
          Nothing is scheduled until you confirm the complete plan.
        </p>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-neutral-500">Selected posts</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {preview.summary.plannedPosts}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-neutral-500">Available times</div>
          <div className="mt-1 text-xl font-semibold text-white">
            {preview.summary.availableSlots}
          </div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-neutral-500">Open times</div>
          <div className="mt-1 text-xl font-semibold text-amber-200">
            {preview.summary.unfilledSlots}
          </div>
        </div>
      </div>

      {[...assignmentsByDate.entries()].map(([date, assignments]) => (
        <section
          key={date}
          className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/70"
        >
          <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-3 py-2">
            <div>
              <div className="text-sm font-medium text-white">
                {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <div className="text-xs text-neutral-500">
                {assignments.length} post{assignments.length === 1 ? "" : "s"}
              </div>
            </div>
            {onRerollDay ? (
              <Button
                type="button"
                variant="secondary"
                className="h-8 px-2.5 text-xs"
                disabled={busy}
                onClick={() => onRerollDay(date)}
              >
                <span className="inline-flex items-center gap-1.5">
                  {rerollingDate === date ? (
                    <LoaderCircle size={13} className="animate-spin" />
                  ) : (
                    <RotateCcw size={13} />
                  )}
                  Reroll day
                </span>
              </Button>
            ) : null}
          </div>
          <div className="divide-y divide-neutral-800">
            {assignments.map((assignment) => (
              <div
                key={`${assignment.postId}:${assignment.scheduledAt}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                {availablePosts && onReplaceAssignmentPost ? (
                  <div className="min-w-0 flex-1">
                    <CustomSelect
                      value={assignment.postId}
                      onChange={(nextPostId) =>
                        onReplaceAssignmentPost(
                          assignment.postId,
                          assignment.scheduledAt,
                          nextPostId,
                        )
                      }
                      options={availablePosts.map((post) => ({
                        value: post.id,
                        label: post.title,
                        iconUrl:
                          post.iconPresentation?.type === "image"
                            ? post.iconPresentation.url
                            : undefined,
                        iconEmoji:
                          post.iconPresentation?.type === "unicode"
                            ? post.iconPresentation.value
                            : post.iconPresentation
                              ? undefined
                              : "📝",
                      }))}
                    />
                  </div>
                ) : (
                  <span className="min-w-0 truncate text-neutral-200">
                    {assignment.title}
                  </span>
                )}
                {onOpenPostInNewTab ? (
                  <button
                    type="button"
                    aria-label={`Open ${assignment.title} in new tab`}
                    title="Open post in new tab"
                    onClick={() => onOpenPostInNewTab(assignment.postId)}
                    className="shrink-0 rounded-md p-1.5 text-blue-300 hover:bg-blue-950/50 hover:text-blue-200"
                  >
                    <ExternalLink size={14} />
                  </button>
                ) : null}
                <span className="shrink-0 tabular-nums text-neutral-400">
                  {new Date(assignment.scheduledAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {onRemoveAssignment ? (
                  <button
                    type="button"
                    aria-label={`Remove ${assignment.title} from plan`}
                    onClick={() =>
                      onRemoveAssignment(
                        assignment.postId,
                        assignment.scheduledAt,
                      )
                    }
                    className="shrink-0 rounded-md p-1.5 text-rose-300 hover:bg-rose-950/50"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!preview.assignments.length ? (
        <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
          No matching draft posts were found for the available times.
        </div>
      ) : null}

      <div className="flex justify-end border-t border-neutral-800 pt-3">
        <Button
          type="button"
          onClick={onScheduleAll}
          disabled={busy || !preview.assignments.length}
        >
          <span className="inline-flex items-center gap-2">
            {busy && !rerollingDate ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <CalendarCheck2 size={15} />
            )}
            Schedule all {preview.assignments.length} posts
          </span>
        </Button>
      </div>
    </div>
  );
}

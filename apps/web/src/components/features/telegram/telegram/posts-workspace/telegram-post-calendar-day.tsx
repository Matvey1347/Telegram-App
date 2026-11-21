"use client";

import { wantsNewTab } from "../managed-post-identity";

import { Card, Input, Button } from "@/components/ui/primitives";
import { buildTelegramPostsUrl } from "@/lib/features/telegram/telegram-posts-url";
import { localTimeKey } from "@/lib/features/telegram/telegram-calendar-scheduler";
import {
  calendarStatusIcon,
  timeLabel,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import { ManagedPostTelegramIdentityIndicator } from "@/components/features/telegram/telegram/managed-post-telegram-link";
import { Rocket, Layers3 } from "lucide-react";
import { TELEGRAM_AD_PLACEMENT_STATUS_KEYS } from "@telegram-system/shared";
import { CalendarManualSchedulerPanel } from "@/components/features/telegram/telegram/calendar-manual-scheduler-panel";
import { CalendarPostGroupSection } from "@/components/features/telegram/telegram/calendar-post-group-section";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { formatDate } from "@/lib/date-format";
import { shouldIgnoreModifiedPostOpen } from "./telegram-post-workspace-model";
import { PostIcon } from "../managed-post-identity";
import { CalendarPostTimePicker } from "./telegram-post-calendar-time-picker";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "selectedCalendarDateLabel"
  | "workspaceTimezone"
  | "selectedCalendarItems"
  | "channelId"
  | "changePostView"
  | "posts"
  | "selectPost"
  | "onPostSelect"
  | "calendarPresetSlotByTime"
  | "t"
  | "channelTimePosts"
  | "showAdSalesOverlay"
  | "selectedAdCalendarItems"
  | "locale"
  | "calendarSchedulablePosts"
  | "calendarBatchSelectedPosts"
  | "calendarBatchBusy"
  | "clearCalendarBatchSelection"
  | "calendarPostSearch"
  | "setCalendarPostSearch"
  | "calendarFilteredSchedulablePosts"
  | "calendarGroupedSchedulablePosts"
  | "calendarBatchSelectedPostIds"
  | "openPostInNewTab"
  | "toggleCalendarBatchPostSelection"
  | "selectedCalendarDate"
  | "availableCalendarScheduleSlots"
  | "calendarScheduleSlots"
  | "calendarBatchTimeChoiceByPostId"
  | "calendarBatchCustomTimeByPostId"
  | "setCalendarBatchTimeChoiceByPostId"
  | "setCalendarBatchCustomTimeByPostId"
  | "calendarBatchPlan"
  | "calendarSchedulablePostsById"
  | "openPostWithModifier"
  | "scheduleCalendarBatch"
>;

export function TelegramPostCalendarDay({ model }: { model: Model }) {
  const {
    selectedCalendarDateLabel,
    workspaceTimezone,
    selectedCalendarItems,
    channelId,
    changePostView,
    posts,
    selectPost,
    onPostSelect,
    calendarPresetSlotByTime,
    t,
    channelTimePosts,
    showAdSalesOverlay,
    selectedAdCalendarItems,
    locale,
    calendarSchedulablePosts,
    calendarBatchSelectedPosts,
    calendarBatchBusy,
    clearCalendarBatchSelection,
    calendarPostSearch,
    setCalendarPostSearch,
    calendarFilteredSchedulablePosts,
    calendarGroupedSchedulablePosts,
    calendarBatchSelectedPostIds,
    openPostInNewTab,
    toggleCalendarBatchPostSelection,
    selectedCalendarDate,
    availableCalendarScheduleSlots,
    calendarScheduleSlots,
    calendarBatchTimeChoiceByPostId,
    calendarBatchCustomTimeByPostId,
    setCalendarBatchTimeChoiceByPostId,
    setCalendarBatchCustomTimeByPostId,
    calendarBatchPlan,
    calendarSchedulablePostsById,
    openPostWithModifier,
    scheduleCalendarBatch,
  } = model;
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {selectedCalendarDateLabel}
          </h3>
          <p className="mt-1 text-sm text-neutral-400">{workspaceTimezone}</p>
        </div>
      </div>
      <div className="space-y-3">
        {selectedCalendarItems.length ? (
          selectedCalendarItems.map((item) => (
            <button
              key={`${item.id}:${item.status}:${item.status === "SCHEDULED" ? item.scheduledAt : item.publishedAt}`}
              type="button"
              onClick={(event) => {
                if (wantsNewTab(event)) {
                  window.open(
                    buildTelegramPostsUrl({
                      channelId,
                      postId: item.id,
                      postView: "editor",
                    }),
                    "_blank",
                    "noopener,noreferrer",
                  );
                  return;
                }
                changePostView("editor");
                const post = posts.data?.find((entry) => entry.id === item.id);
                if (post) {
                  selectPost(post);
                  onPostSelect(post.id);
                }
              }}
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 text-left transition hover:border-blue-700"
            >
              {(() => {
                const linkedPost = posts.data?.find(
                  (entry) => entry.id === item.id,
                );
                const matchedSlot =
                  item.status === "SCHEDULED" && item.scheduledAt
                    ? calendarPresetSlotByTime.get(
                        localTimeKey(item.scheduledAt),
                      )
                    : undefined;
                return (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {linkedPost?.icon ? (
                          <PostIcon
                            iconId={linkedPost.icon}
                            icon={linkedPost.iconPresentation}
                            label={item.title}
                            bare
                          />
                        ) : (
                          <span className="text-base leading-none">
                            {calendarStatusIcon(item.status)}
                          </span>
                        )}
                        <div className="truncate text-sm font-medium text-white">
                          {item.title}
                        </div>
                        <ManagedPostTelegramIdentityIndicator post={item} />
                      </div>
                      <div className="mt-1 text-xs text-neutral-400">
                        {item.status === "SCHEDULED"
                          ? t("telegram.posts.editor.scheduled")
                          : t("telegram.posts.editor.published")}{" "}
                        ·{" "}
                        {timeLabel(
                          item.status === "SCHEDULED"
                            ? item.scheduledAt
                            : item.publishedAt,
                        )}
                      </div>
                      {matchedSlot ? (
                        <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-700/40 bg-emerald-950/30 px-2 py-1 text-[11px] text-emerald-200">
                          <span className="shrink-0">
                            {(() => {
                              const presentation = channelTimePosts.find(
                                (slot) => slot.id === matchedSlot.id,
                              )?.iconPresentation;
                              return presentation?.type === "unicode"
                                ? presentation.value
                                : "⚡";
                            })()}
                          </span>
                          <span className="truncate">
                            {t("telegram.posts.calendar.slotMatch", {
                              time: matchedSlot.time,
                              title: matchedSlot.title,
                            })}
                          </span>
                        </div>
                      ) : null}
                      {item.isAutoPlanned ? (
                        <div className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-700/40 bg-blue-950/30 px-2 py-1 text-[11px] text-blue-200">
                          <Rocket size={12} />
                          <span className="truncate">
                            {t("telegram.posts.calendar.importedPlan")}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    {item.origin === "TELEGRAM" ? (
                      <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-amber-200">
                        {t("telegram.posts.calendar.createdInTelegram")}
                      </span>
                    ) : null}
                  </div>
                );
              })()}
            </button>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
            {t("telegram.posts.calendar.noPostsDay")}
          </div>
        )}
        {showAdSalesOverlay && selectedAdCalendarItems.length ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <Layers3 size={14} />
              {t("telegram.posts.calendar.adPlacements")}
            </div>
            {selectedAdCalendarItems.map((item) => {
              const placement = item.existingPlacement;
              const displayViews = placement
                ? (placement.viewsCount ?? 0)
                : item.expectedViews;
              const displayPrice = placement
                ? placement.agreedPrice
                : item.recommendedPrice;
              const displayCurrency = placement?.currency ?? item.currency;
              return (
                <div
                  key={`${item.channelId}:${item.scheduledAt}:${placement?.id ?? item.state}`}
                  className="rounded-xl border border-sky-800/50 bg-sky-950/20 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {placement?.advertiserName ||
                          placement?.title ||
                          (placement
                            ? t(
                                TELEGRAM_AD_PLACEMENT_STATUS_KEYS[
                                  placement.status
                                ],
                              )
                            : t(
                                "telegram.posts.calendar.unavailablePlacement",
                              ))}
                      </p>
                      <p className="mt-1 text-xs text-neutral-300">
                        {timeLabel(item.scheduledAt)} ·{" "}
                        {t("telegram.posts.calendar.views", {
                          count: displayViews.toLocaleString(locale),
                        })}
                      </p>
                      {placement?.title &&
                      placement.title !== placement.advertiserName ? (
                        <p className="mt-1 text-xs text-neutral-400">
                          {placement.title}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-neutral-300">
                      <p>
                        {displayPrice} {displayCurrency}
                      </p>
                      {placement ? (
                        <p className="mt-1 text-neutral-500">
                          {t(
                            TELEGRAM_AD_PLACEMENT_STATUS_KEYS[placement.status],
                          )}
                        </p>
                      ) : (
                        <p>
                          {t("telegram.posts.calendar.minimum", {
                            amount: item.minimumPrice,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  {!placement ? (
                    <p className="mt-2 text-xs text-neutral-400">
                      {t("telegram.posts.calendar.unavailablePlacement")}
                    </p>
                  ) : null}
                  {placement?.saleId ? (
                    <a
                      href={`/ad-sales?saleId=${placement.saleId}`}
                      className="mt-3 inline-flex text-xs font-medium text-blue-300 hover:text-blue-200"
                    >
                      {t("telegram.posts.calendar.openSale")}
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <CalendarManualSchedulerPanel
        candidateCount={calendarSchedulablePosts.length}
        selectedCount={calendarBatchSelectedPosts.length}
        busy={calendarBatchBusy}
        onClear={clearCalendarBatchSelection}
      >
        <div className="mt-4 space-y-2">
          <Input
            value={calendarPostSearch}
            onChange={(event) => setCalendarPostSearch(event.target.value)}
            placeholder={t("telegram.posts.calendar.searchPostsGroups")}
          />
          {!calendarFilteredSchedulablePosts.length ? (
            <div className="rounded-xl border border-dashed border-neutral-800 px-4 py-5 text-sm text-neutral-500">
              {t("telegram.posts.calendar.noSearchMatches")}
            </div>
          ) : (
            <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-neutral-800 p-2">
              {calendarGroupedSchedulablePosts.groups.map((section) => (
                <CalendarPostGroupSection
                  key={section.group.id}
                  title={telegramPostGroupTitle(section.group, t)}
                  count={section.posts.length}
                  icon={
                    <PostIcon
                      iconId={section.group.icon}
                      icon={section.group.iconPresentation}
                      label={telegramPostGroupTitle(section.group, t)}
                      bare
                    />
                  }
                >
                  {section.posts.map((post) => {
                    const selected = calendarBatchSelectedPostIds.includes(
                      post.id,
                    );
                    return (
                      <div
                        key={post.id}
                        onClick={(event) => {
                          if (
                            !wantsNewTab(event) ||
                            shouldIgnoreModifiedPostOpen(event.target)
                          ) {
                            return;
                          }
                          event.preventDefault();
                          openPostInNewTab(post);
                        }}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                          selected
                            ? "border-blue-700 bg-blue-950/20"
                            : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            toggleCalendarBatchPostSelection(post.id)
                          }
                          aria-pressed={selected}
                          aria-label={
                            selected
                              ? t("telegram.posts.editor.unselectNamed", {
                                  title: post.title,
                                })
                              : t("telegram.posts.editor.selectNamed", {
                                  title: post.title,
                                })
                          }
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                            selected
                              ? "border-blue-500 bg-blue-500 text-white"
                              : "border-neutral-700 text-neutral-500"
                          }`}
                        >
                          {selected ? "✓" : ""}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            {post.icon ? (
                              <PostIcon
                                iconId={post.icon}
                                icon={post.iconPresentation}
                                label={post.title}
                                bare
                              />
                            ) : (
                              <span className="text-sm leading-none">📝</span>
                            )}
                            <span className="truncate text-sm font-medium text-white">
                              {post.title}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {post.status === "FAILED"
                              ? t("telegram.posts.calendar.failed")
                              : t("telegram.posts.calendar.draft")}{" "}
                            ·{" "}
                            {t("telegram.posts.created", {
                              date: formatDate(post.createdAt, locale),
                            })}
                          </div>
                          {selected ? (
                            <CalendarPostTimePicker
                              post={post}
                              selectedCalendarDate={selectedCalendarDate}
                              availableCalendarScheduleSlots={
                                availableCalendarScheduleSlots
                              }
                              calendarScheduleSlots={calendarScheduleSlots}
                              channelId={channelId}
                              channelTimePosts={channelTimePosts}
                              selectedPostIds={calendarBatchSelectedPostIds}
                              timeChoiceByPostId={
                                calendarBatchTimeChoiceByPostId
                              }
                              customTimeByPostId={
                                calendarBatchCustomTimeByPostId
                              }
                              onTimeChoiceChange={
                                setCalendarBatchTimeChoiceByPostId
                              }
                              onCustomTimeChange={
                                setCalendarBatchCustomTimeByPostId
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </CalendarPostGroupSection>
              ))}
              {calendarGroupedSchedulablePosts.ungrouped.map((post) => {
                const selected = calendarBatchSelectedPostIds.includes(post.id);
                return (
                  <div
                    key={post.id}
                    onClick={(event) => {
                      if (
                        !wantsNewTab(event) ||
                        shouldIgnoreModifiedPostOpen(event.target)
                      ) {
                        return;
                      }
                      event.preventDefault();
                      openPostInNewTab(post);
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-blue-700 bg-blue-950/20"
                        : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCalendarBatchPostSelection(post.id)}
                      aria-pressed={selected}
                      aria-label={
                        selected
                          ? t("telegram.posts.editor.unselectNamed", {
                              title: post.title,
                            })
                          : t("telegram.posts.editor.selectNamed", {
                              title: post.title,
                            })
                      }
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        selected
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-neutral-700 text-neutral-500"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {post.icon ? (
                          <PostIcon
                            iconId={post.icon}
                            icon={post.iconPresentation}
                            label={post.title}
                            bare
                          />
                        ) : (
                          <span className="text-sm leading-none">📝</span>
                        )}
                        <span className="truncate text-sm font-medium text-white">
                          {post.title}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {post.status === "FAILED"
                          ? t("telegram.posts.calendar.failed")
                          : t("telegram.posts.calendar.draft")}{" "}
                        ·{" "}
                        {t("telegram.posts.created", {
                          date: formatDate(post.createdAt, locale),
                        })}
                      </div>
                      {selected ? (
                        <CalendarPostTimePicker
                          post={post}
                          selectedCalendarDate={selectedCalendarDate}
                          availableCalendarScheduleSlots={
                            availableCalendarScheduleSlots
                          }
                          calendarScheduleSlots={calendarScheduleSlots}
                          channelId={channelId}
                          channelTimePosts={channelTimePosts}
                          selectedPostIds={calendarBatchSelectedPostIds}
                          timeChoiceByPostId={calendarBatchTimeChoiceByPostId}
                          customTimeByPostId={calendarBatchCustomTimeByPostId}
                          onTimeChoiceChange={
                            setCalendarBatchTimeChoiceByPostId
                          }
                          onCustomTimeChange={
                            setCalendarBatchCustomTimeByPostId
                          }
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-neutral-300">
              {t("telegram.posts.calendar.schedulePreview")}
            </div>
            <div className="whitespace-nowrap text-xs tabular-nums text-neutral-500">
              {t("telegram.posts.calendar.willBeScheduled", {
                assigned: calendarBatchPlan.assignments.length,
                selected: calendarBatchSelectedPostIds.length,
              })}
            </div>
          </div>
          {calendarBatchPlan.assignments.length ? (
            <div className="mt-3 space-y-2">
              {calendarBatchPlan.assignments.map((assignment) => {
                const post = calendarSchedulablePostsById.get(
                  assignment.postId,
                );
                const slot = calendarScheduleSlots.find(
                  (item) => item.scheduledAt === assignment.scheduledAt,
                );
                const title = post?.title || assignment.postId;
                return (
                  <button
                    type="button"
                    key={`${assignment.postId}:${assignment.scheduledAt}`}
                    disabled={!post}
                    onClick={(event) => {
                      if (post) openPostWithModifier(post, event);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-800 px-3 py-2 text-left text-sm transition hover:border-neutral-700 hover:bg-neutral-900/70 disabled:cursor-default disabled:hover:border-neutral-800 disabled:hover:bg-transparent"
                    title={post ? t("telegram.posts.calendar.openPost") : title}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {post?.icon ? (
                        <PostIcon
                          iconId={post.icon}
                          icon={post.iconPresentation}
                          label={post.title}
                          bare
                          size="xs"
                        />
                      ) : (
                        <span aria-hidden="true" className="shrink-0 text-sm">
                          📝
                        </span>
                      )}
                      <span className="min-w-0 truncate text-white">
                        {title}
                      </span>
                    </div>
                    <div className="shrink-0 text-right text-xs text-neutral-400">
                      <div>
                        {slot?.time || timeLabel(assignment.scheduledAt)}
                      </div>
                      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                        {slot?.source === "custom"
                          ? t("telegram.posts.calendar.custom")
                          : t("telegram.posts.calendar.slot")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-2 text-sm text-neutral-500">
              {t("telegram.posts.calendar.assignHint")}
            </div>
          )}
          {calendarBatchPlan.invalidPostIds.length ? (
            <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              {t("telegram.posts.calendar.invalidAssignments", {
                count: calendarBatchPlan.invalidPostIds.length,
              })}
            </div>
          ) : null}
          {calendarBatchPlan.duplicatePostIds.length ? (
            <div className="mt-3 rounded-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
              {t("telegram.posts.calendar.duplicateAssignments", {
                count: calendarBatchPlan.duplicatePostIds.length,
              })}
            </div>
          ) : null}
          <div className="mt-4 flex justify-end">
            <Button
              onClick={scheduleCalendarBatch}
              disabled={
                calendarBatchBusy || !calendarBatchPlan.assignments.length
              }
            >
              {calendarBatchBusy
                ? t("telegram.posts.calendar.scheduling")
                : t("telegram.posts.calendar.scheduleCount", {
                    count: calendarBatchPlan.assignments.length,
                  })}
            </Button>
          </div>
        </div>
      </CalendarManualSchedulerPanel>
    </Card>
  );
}

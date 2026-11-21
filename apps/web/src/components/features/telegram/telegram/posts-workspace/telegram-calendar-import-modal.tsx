"use client";

import {
  Modal,
  Card,
  FormField,
  DateInput,
  CustomSelect,
  Button,
} from "@/components/ui/primitives";
import { ChannelImportNavigation } from "@/components/features/telegram/telegram/channel-import-navigation";
import { CalendarPlanImport } from "@/components/features/telegram/telegram/calendar-plan-import";
import { AutoCalendarPlannerPreview } from "@/components/features/telegram/telegram/auto-calendar-planner-preview";
import {
  toLocalDateKey,
  addDays,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import { LoaderCircle, ListPlus } from "lucide-react";
import { redistributePlannerFormatWeight } from "@/lib/features/telegram/telegram-planner-weights";
import { PlannerFormatWeightSlider } from "./telegram-planner-format-controls";
import { TelegramCalendarPlannerFormatSettings } from "./telegram-calendar-planner-format-settings";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "importMode"
  | "onImportModeChange"
  | "t"
  | "autoPlannerBusy"
  | "channelId"
  | "channelTitle"
  | "calendarPlanImportPosts"
  | "effectivePostGroupId"
  | "workspaceTimezone"
  | "calendarPlanImportContent"
  | "setCalendarPlanImportContent"
  | "setAutoPlannerPreview"
  | "setAutoPlannerPreviewSource"
  | "autoPlannerPreview"
  | "autoPlannerPreviewSource"
  | "scheduleAutoPlannerPreview"
  | "removeAutoPlannerAssignment"
  | "replaceAutoPlannerAssignmentPost"
  | "openPostInNewTab"
  | "autoPlannerMode"
  | "autoPlannerFrom"
  | "setAutoPlannerFrom"
  | "autoPlannerDays"
  | "setAutoPlannerTo"
  | "setAutoPlannerDays"
  | "autoPlannerTo"
  | "fillPlannerRange"
  | "canUsePlannerFormatSlots"
  | "hasPlannerFormatSlots"
  | "plannerFormatsWithWeights"
  | "setPlannerFormatWeights"
  | "plannerFormats"
  | "autoPlannerRerollingDate"
  | "rerollAutoPlannerDay"
  | "calendarSchedulablePosts"
  | "newPlannerFormatIcon"
  | "setNewPlannerFormatIcon"
  | "pushToast"
  | "localizedApiError"
  | "newPlannerFormatName"
  | "setNewPlannerFormatName"
  | "createPlannerFormat"
  | "plannerSlotGroupsByFormatId"
  | "plannerSlotDraftsByFormatId"
  | "plannerFormatDraftsById"
  | "editingPlannerFormatIds"
  | "updatePlannerFormatDraft"
  | "savePlannerFormatDraft"
  | "setPlannerFormatDraftsById"
  | "setEditingPlannerFormatIds"
  | "setDeletingPlannerFormat"
  | "plannerSlotEditDraftsById"
  | "plannerTimePostsById"
  | "editingPlannerSlotGroupIds"
  | "plannerTimePostsByTime"
  | "postGroupsById"
  | "updatePlannerSlotGroupEditDraft"
  | "plannerGroupOptions"
  | "plannerTimePostOptions"
  | "savePlannerSlotGroupEditDraft"
  | "resetPlannerSlotEditDraft"
  | "setEditingPlannerSlotGroupIds"
  | "setDeletingPlannerSlotGroup"
  | "setPlannerSlotDraftsByFormatId"
  | "createPlannerSlot"
>;

export function TelegramCalendarImportModal({ model }: { model: Model }) {
  const {
    importMode,
    onImportModeChange,
    t,
    autoPlannerBusy,
    channelId,
    channelTitle,
    calendarPlanImportPosts,
    effectivePostGroupId,
    workspaceTimezone,
    calendarPlanImportContent,
    setCalendarPlanImportContent,
    setAutoPlannerPreview,
    setAutoPlannerPreviewSource,
    autoPlannerPreview,
    autoPlannerPreviewSource,
    scheduleAutoPlannerPreview,
    removeAutoPlannerAssignment,
    replaceAutoPlannerAssignmentPost,
    openPostInNewTab,
    autoPlannerMode,
    autoPlannerFrom,
    setAutoPlannerFrom,
    autoPlannerDays,
    setAutoPlannerTo,
    setAutoPlannerDays,
    autoPlannerTo,
    fillPlannerRange,
    canUsePlannerFormatSlots,
    hasPlannerFormatSlots,
    plannerFormatsWithWeights,
    setPlannerFormatWeights,
    plannerFormats,
    autoPlannerRerollingDate,
    rerollAutoPlannerDay,
    calendarSchedulablePosts,
  } = model;
  return (
    <Modal
      open={importMode === "calendar"}
      onClose={() => onImportModeChange(null)}
      title={t("telegram.posts.import.title")}
      size="xl"
    >
      <div className="grid gap-4">
        <div className="space-y-4">
          <ChannelImportNavigation
            value="calendar"
            onChange={onImportModeChange}
            disabled={autoPlannerBusy}
          />
          <div>
            <CalendarPlanImport
              channelId={channelId}
              channelTitle={channelTitle}
              posts={calendarPlanImportPosts.map((post) => ({
                ...post,
                groupId: effectivePostGroupId(post),
              }))}
              timezone={workspaceTimezone}
              disabled={autoPlannerBusy}
              content={calendarPlanImportContent}
              onContentChange={setCalendarPlanImportContent}
              onPreview={(preview) => {
                setAutoPlannerPreview(preview);
                setAutoPlannerPreviewSource("import");
              }}
            />
            {autoPlannerPreview && autoPlannerPreviewSource === "import" ? (
              <AutoCalendarPlannerPreview
                preview={autoPlannerPreview}
                busy={autoPlannerBusy}
                rerollingDate={null}
                onScheduleAll={scheduleAutoPlannerPreview}
                availablePosts={calendarPlanImportPosts}
                onRemoveAssignment={removeAutoPlannerAssignment}
                onReplaceAssignmentPost={replaceAutoPlannerAssignmentPost}
                onOpenPostInNewTab={(postId) => {
                  const post = calendarPlanImportPosts.find(
                    (item) => item.id === postId,
                  );
                  if (post) openPostInNewTab(post);
                }}
              />
            ) : null}
          </div>
          <Card className={autoPlannerMode === "system" ? "p-4" : "hidden"}>
            <div className="flex flex-wrap items-end gap-3">
              <FormField label={t("telegram.posts.calendar.startDate")}>
                <DateInput
                  value={autoPlannerFrom}
                  onChange={(event) => {
                    const next = event.target.value;
                    setAutoPlannerFrom(next);
                    if (autoPlannerDays > 0) {
                      setAutoPlannerTo(
                        toLocalDateKey(
                          addDays(
                            new Date(`${next}T00:00:00`),
                            autoPlannerDays - 1,
                          ),
                        ),
                      );
                    }
                  }}
                />
              </FormField>
              <FormField label={t("telegram.posts.calendar.range")}>
                <CustomSelect
                  value={String(autoPlannerDays)}
                  onChange={(value) => {
                    const days = Number(value);
                    setAutoPlannerDays(days);
                    if (days > 0) {
                      setAutoPlannerTo(
                        toLocalDateKey(
                          addDays(
                            new Date(`${autoPlannerFrom}T00:00:00`),
                            days - 1,
                          ),
                        ),
                      );
                    }
                  }}
                  options={[
                    ...[7, 10, 14, 20, 30].map((days) => ({
                      value: String(days),
                      label: t("telegram.posts.calendar.days", {
                        count: days,
                      }),
                    })),
                    {
                      value: "0",
                      label: t("telegram.posts.calendar.custom"),
                    },
                  ]}
                />
              </FormField>
              {autoPlannerDays === 0 ? (
                <FormField label={t("telegram.posts.calendar.endDate")}>
                  <DateInput
                    value={autoPlannerTo}
                    onChange={(event) => setAutoPlannerTo(event.target.value)}
                  />
                </FormField>
              ) : null}
              <Button
                onClick={fillPlannerRange}
                disabled={autoPlannerBusy || !canUsePlannerFormatSlots}
              >
                <span className="inline-flex items-center gap-2">
                  {autoPlannerBusy ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : (
                    <ListPlus size={15} />
                  )}
                  {t("telegram.posts.calendar.previewFill")}
                </span>
              </Button>
            </div>
            {!hasPlannerFormatSlots ? (
              <p className="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
                {t("telegram.posts.calendar.addSlotBeforePreview")}
              </p>
            ) : null}
            {plannerFormatsWithWeights.length ? (
              <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-white">
                    {t("telegram.posts.calendar.formatFrequencyTitle")}
                  </h4>
                  <span className="text-xs text-neutral-500">
                    {t("telegram.posts.calendar.frequencyShare")}
                  </span>
                </div>
                <div className="space-y-3">
                  {plannerFormatsWithWeights.map(({ format, weight }) => (
                    <div
                      key={format.id}
                      className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)_56px] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-2 text-sm text-neutral-200">
                        <span className="shrink-0">{format.icon || "◌"}</span>
                        <span className="truncate">{format.name}</span>
                      </div>
                      <PlannerFormatWeightSlider
                        label={t("telegram.posts.calendar.formatFrequency", {
                          name: format.name,
                        })}
                        value={weight}
                        disabled={autoPlannerBusy}
                        onChange={(nextWeight) =>
                          setPlannerFormatWeights((current) =>
                            redistributePlannerFormatWeight(
                              (plannerFormats.data || []).map(
                                (item) => item.id,
                              ),
                              current,
                              format.id,
                              nextWeight,
                            ),
                          )
                        }
                      />
                      <div className="text-right text-xs tabular-nums text-neutral-400">
                        {weight}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {autoPlannerPreview && autoPlannerPreviewSource === "system" ? (
              <AutoCalendarPlannerPreview
                preview={autoPlannerPreview}
                busy={autoPlannerBusy}
                rerollingDate={autoPlannerRerollingDate}
                onRerollDay={rerollAutoPlannerDay}
                onScheduleAll={scheduleAutoPlannerPreview}
                availablePosts={calendarSchedulablePosts.map((post) => ({
                  id: post.id,
                  title: post.title,
                  iconPresentation: post.iconPresentation,
                }))}
                onRemoveAssignment={removeAutoPlannerAssignment}
                onReplaceAssignmentPost={replaceAutoPlannerAssignmentPost}
                onOpenPostInNewTab={(postId) => {
                  const post = calendarSchedulablePosts.find(
                    (item) => item.id === postId,
                  );
                  if (post) openPostInNewTab(post);
                }}
              />
            ) : null}
          </Card>

          <TelegramCalendarPlannerFormatSettings model={model} />
        </div>
      </div>
    </Modal>
  );
}

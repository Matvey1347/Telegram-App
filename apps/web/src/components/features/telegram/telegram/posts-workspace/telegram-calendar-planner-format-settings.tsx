"use client";

import {
  Card,
  Input,
  Button,
  FormField,
  MultiSelect,
} from "@/components/ui/primitives";
import {
  LoaderCircle,
  Plus,
  Check,
  Trash2,
  Pencil,
  Clock3,
  RotateCcw,
} from "lucide-react";
import { type TelegramChannelTimePost, type PostGroup } from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { telegramPostGroupTitle } from "@/components/features/telegram/telegram/telegram-post-group-title";
import { PlannerFormatEmojiPicker } from "./telegram-planner-format-controls";
import { sameStringSet } from "./telegram-post-workspace-model";
import { PostIcon } from "../managed-post-identity";
import type { TelegramPostWorkspaceModel } from "./use-telegram-post-workspace";

type Model = Pick<
  TelegramPostWorkspaceModel,
  | "autoPlannerMode"
  | "t"
  | "plannerFormats"
  | "newPlannerFormatIcon"
  | "autoPlannerBusy"
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

export function TelegramCalendarPlannerFormatSettings({
  model,
}: {
  model: Model;
}) {
  const {
    autoPlannerMode,
    t,
    plannerFormats,
    newPlannerFormatIcon,
    autoPlannerBusy,
    setNewPlannerFormatIcon,
    pushToast,
    localizedApiError,
    newPlannerFormatName,
    setNewPlannerFormatName,
    createPlannerFormat,
    plannerSlotGroupsByFormatId,
    plannerSlotDraftsByFormatId,
    plannerFormatDraftsById,
    editingPlannerFormatIds,
    updatePlannerFormatDraft,
    savePlannerFormatDraft,
    setPlannerFormatDraftsById,
    setEditingPlannerFormatIds,
    setDeletingPlannerFormat,
    plannerSlotEditDraftsById,
    plannerTimePostsById,
    editingPlannerSlotGroupIds,
    plannerTimePostsByTime,
    postGroupsById,
    updatePlannerSlotGroupEditDraft,
    plannerGroupOptions,
    plannerTimePostOptions,
    savePlannerSlotGroupEditDraft,
    resetPlannerSlotEditDraft,
    setEditingPlannerSlotGroupIds,
    setDeletingPlannerSlotGroup,
    setPlannerSlotDraftsByFormatId,
    createPlannerSlot,
  } = model;
  return (
    <Card className={autoPlannerMode === "system" ? "p-4" : "hidden"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">
          {t("telegram.posts.calendar.formats")}
        </h3>
        {plannerFormats.isLoading ? (
          <LoaderCircle size={15} className="animate-spin text-neutral-500" />
        ) : null}
      </div>
      <div className="flex gap-2">
        <PlannerFormatEmojiPicker
          value={newPlannerFormatIcon}
          disabled={autoPlannerBusy}
          onChange={(nextIcon) => setNewPlannerFormatIcon(nextIcon ?? "")}
          onError={(error) =>
            pushToast(
              localizedApiError(
                error,
                t("telegram.posts.calendar.error.selectEmoji"),
              ),
              "error",
            )
          }
        />
        <Input
          value={newPlannerFormatName}
          onChange={(event) => setNewPlannerFormatName(event.target.value)}
          placeholder={t("telegram.posts.calendar.formatName")}
        />
        <Button
          variant="secondary"
          onClick={createPlannerFormat}
          disabled={autoPlannerBusy || !newPlannerFormatName.trim()}
        >
          <Plus size={15} />
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {(plannerFormats.data || []).map((format) => {
          const slotGroups = plannerSlotGroupsByFormatId.get(format.id) || [];
          const draft = plannerSlotDraftsByFormatId[format.id] || {
            timePostIds: [],
            groupIds: [],
          };
          const formatDraft = plannerFormatDraftsById[format.id];
          const editableFormat = formatDraft ?? {
            name: format.name,
            icon: format.icon ?? "",
          };
          const formatDirty = Boolean(
            formatDraft &&
            (formatDraft.name !== format.name ||
              formatDraft.icon !== (format.icon ?? "")),
          );
          const formatEditing = editingPlannerFormatIds.includes(format.id);
          return (
            <div
              key={format.id}
              className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
            >
              <div className="flex items-center gap-3">
                {formatEditing ? (
                  <>
                    <PlannerFormatEmojiPicker
                      value={editableFormat.icon}
                      disabled={autoPlannerBusy}
                      className="h-8 w-8"
                      iconClassName="!h-4 !w-4 !bg-transparent"
                      onChange={(nextIcon) =>
                        updatePlannerFormatDraft(format, {
                          icon: nextIcon ?? "",
                        })
                      }
                      onError={(error) =>
                        pushToast(
                          localizedApiError(
                            error,
                            t("telegram.posts.calendar.error.updateEmoji"),
                          ),
                          "error",
                        )
                      }
                    />
                    <Input
                      value={editableFormat.name}
                      disabled={autoPlannerBusy}
                      onChange={(event) =>
                        updatePlannerFormatDraft(format, {
                          name: event.target.value,
                        })
                      }
                      className="h-9 min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        autoPlannerBusy ||
                        !formatDirty ||
                        !editableFormat.name.trim()
                      }
                      onClick={() => savePlannerFormatDraft(format)}
                      className="h-9 shrink-0 border-emerald-800/70 bg-emerald-950/35 px-3 text-emerald-100 hover:bg-emerald-900/45 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                    >
                      <Check size={14} /> {t("common.save")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={autoPlannerBusy}
                      onClick={() => {
                        setPlannerFormatDraftsById((current) => {
                          const next = { ...current };
                          delete next[format.id];
                          return next;
                        });
                        setEditingPlannerFormatIds((current) =>
                          current.filter((id) => id !== format.id),
                        );
                      }}
                      className="h-9 shrink-0 px-3"
                    >
                      {t("common.cancel")}
                    </Button>
                    <button
                      type="button"
                      disabled={autoPlannerBusy}
                      onClick={() => setDeletingPlannerFormat(format)}
                      className="rounded-md border border-red-800/70 p-1.5 text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                      aria-label={t(
                        "telegram.posts.calendar.deleteNamedFormat",
                        {
                          name: format.name,
                        },
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-lg">{format.icon || "◌"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {format.name}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {t("telegram.posts.calendar.configuredSlots", {
                          count: slotGroups.length,
                        })}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setEditingPlannerFormatIds((current) => [
                          ...current,
                          format.id,
                        ])
                      }
                    >
                      <Pencil size={14} /> {t("common.edit")}
                    </Button>
                  </>
                )}
              </div>
              {formatEditing ? (
                <div className="mt-3 space-y-2">
                  {slotGroups.map((slotGroup) => {
                    const primarySlot = slotGroup.slots[0];
                    const slotDraft = plannerSlotEditDraftsById[
                      slotGroup.id
                    ] ?? {
                      timePostIds: slotGroup.timePostIds,
                      groupIds: slotGroup.groupIds,
                    };
                    const selectedTimePosts = slotDraft.timePostIds
                      .map((timePostId) => plannerTimePostsById.get(timePostId))
                      .filter((timePost): timePost is TelegramChannelTimePost =>
                        Boolean(timePost),
                      );
                    const slotDirty =
                      !sameStringSet(
                        slotDraft.timePostIds,
                        slotGroup.timePostIds,
                      ) ||
                      !sameStringSet(slotDraft.groupIds, slotGroup.groupIds);
                    const slotEditing = editingPlannerSlotGroupIds.includes(
                      slotGroup.id,
                    );
                    const displayTimePosts = selectedTimePosts.length
                      ? selectedTimePosts
                      : slotGroup.slots
                          .map((slot) => plannerTimePostsByTime.get(slot.time))
                          .filter(
                            (timePost): timePost is TelegramChannelTimePost =>
                              Boolean(timePost),
                          );
                    const groups = slotDraft.groupIds
                      .map((groupId) => postGroupsById.get(groupId))
                      .filter((group): group is PostGroup => Boolean(group));
                    return (
                      <div
                        key={slotGroup.id}
                        className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-neutral-100">
                              {displayTimePosts.length ? (
                                displayTimePosts.map((timePost) => (
                                  <span
                                    key={timePost.id}
                                    className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1"
                                  >
                                    {timePost.iconPresentation ? (
                                      <IconAvatar
                                        icon={timePost.iconPresentation}
                                        label={timePost.title}
                                        size="xs"
                                        bordered={false}
                                        className="!bg-transparent"
                                      />
                                    ) : (
                                      <Clock3
                                        size={14}
                                        className="shrink-0 text-neutral-500"
                                      />
                                    )}
                                    <span className="shrink-0 font-semibold">
                                      {timePost.time}
                                    </span>
                                    <span className="min-w-0 truncate text-neutral-300">
                                      {timePost.title}
                                    </span>
                                  </span>
                                ))
                              ) : (
                                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-400">
                                  <Clock3 size={14} />
                                  {primarySlot?.time ??
                                    t("telegram.posts.calendar.noTime")}
                                </span>
                              )}
                              {groups.length ? (
                                groups.map((group) => (
                                  <span
                                    key={group.id}
                                    className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1"
                                  >
                                    <PostIcon
                                      iconId={group.icon}
                                      icon={group.iconPresentation}
                                      label={telegramPostGroupTitle(group, t)}
                                      bare
                                    />
                                    <span className="min-w-0 truncate text-neutral-300">
                                      {telegramPostGroupTitle(group, t)}
                                    </span>
                                  </span>
                                ))
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-400">
                                  {t("telegram.posts.calendar.anyGroup")}
                                </span>
                              )}
                            </div>
                            {slotEditing ? (
                              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                                <FormField
                                  label={t("telegram.posts.calendar.groups")}
                                >
                                  <MultiSelect
                                    value={slotDraft.groupIds}
                                    onChange={(groupIds) =>
                                      updatePlannerSlotGroupEditDraft(
                                        slotGroup,
                                        {
                                          groupIds,
                                        },
                                      )
                                    }
                                    options={plannerGroupOptions}
                                    placeholder={t(
                                      "telegram.posts.calendar.anyGroup",
                                    )}
                                    allSelectedLabel={t(
                                      "telegram.posts.calendar.allGroups",
                                    )}
                                  />
                                </FormField>
                                <FormField
                                  label={t(
                                    "telegram.posts.calendar.publishingTime",
                                  )}
                                >
                                  <MultiSelect
                                    value={slotDraft.timePostIds}
                                    onChange={(timePostIds) =>
                                      updatePlannerSlotGroupEditDraft(
                                        slotGroup,
                                        {
                                          timePostIds,
                                        },
                                      )
                                    }
                                    options={plannerTimePostOptions}
                                    placeholder={t(
                                      "telegram.posts.calendar.selectTime",
                                    )}
                                    allSelectedLabel={t(
                                      "telegram.posts.calendar.allTimes",
                                    )}
                                  />
                                </FormField>
                                <div className="flex md:pt-[22px]">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={
                                      autoPlannerBusy ||
                                      !slotDirty ||
                                      !slotDraft.timePostIds.length
                                    }
                                    onClick={() =>
                                      savePlannerSlotGroupEditDraft(slotGroup)
                                    }
                                    className="h-10 shrink-0 border-emerald-800/70 bg-emerald-950/35 px-3 text-emerald-100 hover:bg-emerald-900/45 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <Check size={14} />
                                      {t("common.save")}
                                    </span>
                                  </Button>
                                </div>
                                <div className="flex md:pt-[22px]">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={autoPlannerBusy}
                                    onClick={() => {
                                      resetPlannerSlotEditDraft(slotGroup.id);
                                      setEditingPlannerSlotGroupIds((current) =>
                                        current.filter(
                                          (id) => id !== slotGroup.id,
                                        ),
                                      );
                                    }}
                                    className="h-10 shrink-0 border-amber-800/60 bg-amber-950/20 px-3 text-amber-100 hover:bg-amber-900/30 disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-500"
                                  >
                                    <span className="inline-flex items-center gap-1.5">
                                      <RotateCcw size={14} />
                                      {t("common.cancel")}
                                    </span>
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-8 px-2.5 text-xs"
                                onClick={() =>
                                  setEditingPlannerSlotGroupIds((current) => [
                                    ...current,
                                    slotGroup.id,
                                  ])
                                }
                              >
                                <Pencil size={13} />{" "}
                                {t("telegram.posts.calendar.editSlot")}
                              </Button>
                            )}
                          </div>
                          {slotEditing ? (
                            <button
                              type="button"
                              disabled={autoPlannerBusy}
                              onClick={() =>
                                setDeletingPlannerSlotGroup(slotGroup)
                              }
                              className="rounded-md border border-red-800/70 p-1.5 text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                              aria-label={t(
                                "telegram.posts.calendar.deleteSlot",
                              )}
                            >
                              <Trash2 size={14} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {!slotGroups.length ? (
                    <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-3 text-sm text-neutral-500">
                      {t("telegram.posts.calendar.noSlotsInFormat")}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {formatEditing ? (
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <FormField label={t("telegram.posts.calendar.groups")}>
                    <MultiSelect
                      value={draft.groupIds}
                      onChange={(groupIds) =>
                        setPlannerSlotDraftsByFormatId((current) => ({
                          ...current,
                          [format.id]: {
                            timePostIds: draft.timePostIds,
                            groupIds,
                          },
                        }))
                      }
                      options={plannerGroupOptions}
                      placeholder={t("telegram.posts.calendar.anyGroup")}
                      allSelectedLabel={t("telegram.posts.calendar.allGroups")}
                    />
                  </FormField>
                  <FormField
                    label={t("telegram.posts.calendar.publishingTime")}
                  >
                    <MultiSelect
                      value={draft.timePostIds}
                      onChange={(timePostIds) =>
                        setPlannerSlotDraftsByFormatId((current) => ({
                          ...current,
                          [format.id]: {
                            timePostIds,
                            groupIds: draft.groupIds,
                          },
                        }))
                      }
                      options={plannerTimePostOptions}
                      placeholder={t("telegram.posts.calendar.selectTime")}
                      allSelectedLabel={t("telegram.posts.calendar.allTimes")}
                    />
                  </FormField>
                  <div className="flex md:pt-[22px]">
                    <Button
                      variant="secondary"
                      onClick={() => createPlannerSlot(format.id)}
                      disabled={autoPlannerBusy || !draft.timePostIds.length}
                      className="inline-flex h-10 min-w-[112px] shrink-0 items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Plus size={15} />
                      {draft.timePostIds.length > 1
                        ? t("telegram.posts.calendar.addSlots")
                        : t("telegram.posts.calendar.addOneSlot")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {!plannerFormats.isLoading && !plannerFormats.data?.length ? (
          <div className="rounded-lg border border-dashed border-neutral-800 px-3 py-4 text-sm text-neutral-500">
            {t("telegram.posts.calendar.noFormats")}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

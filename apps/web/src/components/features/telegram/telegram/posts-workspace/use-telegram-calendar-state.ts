"use client";

import { useState } from "react";
import {
  startOfMonth,
  toLocalDateKey,
  addDays,
} from "@/components/features/telegram/telegram/telegram-posts-calendar-view";
import {
  type TelegramPostPlannerFormat,
  type TelegramPostPlannerPreviewResult,
} from "@telegram-system/shared";
import {
  type PlannerSlotDraft,
  type PlannerSlotEditDraft,
  type PlannerSlotDisplayGroup,
  plannerFormatWeightsPreferenceKey,
  type PlannerFormatDraft,
} from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";

type Input = Pick<TelegramPostWorkspaceProps, "channelId">;

export function useTelegramCalendarState(input: Input) {
  const { channelId } = input;

  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfMonth(new Date()),
  );

  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() =>
    toLocalDateKey(new Date()),
  );

  const [calendarBatchSelectedPostIds, setCalendarBatchSelectedPostIds] =
    useState<string[]>([]);

  const [calendarPostSearch, setCalendarPostSearch] = useState("");

  const [calendarBatchTimeChoiceByPostId, setCalendarBatchTimeChoiceByPostId] =
    useState<Record<string, string>>({});

  const [calendarBatchCustomTimeByPostId, setCalendarBatchCustomTimeByPostId] =
    useState<Record<string, string>>({});

  const [calendarBatchBusy, setCalendarBatchBusy] = useState(false);

  const [showAdSalesOverlay, setShowAdSalesOverlay] = useState(true);

  const [autoPlannerMode] = useState<"system" | "import">("import");

  const [autoPlannerPreviewSource, setAutoPlannerPreviewSource] = useState<
    "system" | "import"
  >("import");

  const [autoPlannerBusy, setAutoPlannerBusy] = useState(false);

  const [autoPlannerDays, setAutoPlannerDays] = useState(7);

  const [autoPlannerFrom, setAutoPlannerFrom] = useState(() =>
    toLocalDateKey(new Date()),
  );

  const [autoPlannerTo, setAutoPlannerTo] = useState(() =>
    toLocalDateKey(addDays(new Date(), 6)),
  );

  const [newPlannerFormatName, setNewPlannerFormatName] = useState("");

  const [newPlannerFormatIcon, setNewPlannerFormatIcon] = useState("");

  const [plannerSlotDraftsByFormatId, setPlannerSlotDraftsByFormatId] =
    useState<Record<string, PlannerSlotDraft>>({});

  const [plannerSlotEditDraftsById, setPlannerSlotEditDraftsById] = useState<
    Record<string, PlannerSlotEditDraft>
  >({});

  const [deletingPlannerFormat, setDeletingPlannerFormat] =
    useState<TelegramPostPlannerFormat | null>(null);

  const [deletingPlannerSlotGroup, setDeletingPlannerSlotGroup] =
    useState<PlannerSlotDisplayGroup | null>(null);

  const [plannerFormatWeights, setPlannerFormatWeights] = useState<
    Record<string, number>
  >(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(
        plannerFormatWeightsPreferenceKey(channelId),
      );
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const [plannerFormatDraftsById, setPlannerFormatDraftsById] = useState<
    Record<string, PlannerFormatDraft>
  >({});

  const [editingPlannerFormatIds, setEditingPlannerFormatIds] = useState<
    string[]
  >([]);

  const [editingPlannerSlotGroupIds, setEditingPlannerSlotGroupIds] = useState<
    string[]
  >([]);

  const [autoPlannerPreview, setAutoPlannerPreview] =
    useState<TelegramPostPlannerPreviewResult | null>(null);

  const [calendarPlanImportContent, setCalendarPlanImportContent] =
    useState("");

  const [autoPlannerRerollingDate, setAutoPlannerRerollingDate] = useState<
    string | null
  >(null);

  const [autoPlannerRerollOffsetsByDate, setAutoPlannerRerollOffsetsByDate] =
    useState<Record<string, number>>({});

  return {
    calendarMonth,
    setCalendarMonth,
    selectedCalendarDate,
    setSelectedCalendarDate,
    calendarBatchSelectedPostIds,
    setCalendarBatchSelectedPostIds,
    calendarPostSearch,
    setCalendarPostSearch,
    calendarBatchTimeChoiceByPostId,
    setCalendarBatchTimeChoiceByPostId,
    calendarBatchCustomTimeByPostId,
    setCalendarBatchCustomTimeByPostId,
    calendarBatchBusy,
    setCalendarBatchBusy,
    showAdSalesOverlay,
    setShowAdSalesOverlay,
    autoPlannerMode,
    autoPlannerPreviewSource,
    setAutoPlannerPreviewSource,
    autoPlannerBusy,
    setAutoPlannerBusy,
    autoPlannerDays,
    setAutoPlannerDays,
    autoPlannerFrom,
    setAutoPlannerFrom,
    autoPlannerTo,
    setAutoPlannerTo,
    newPlannerFormatName,
    setNewPlannerFormatName,
    newPlannerFormatIcon,
    setNewPlannerFormatIcon,
    plannerSlotDraftsByFormatId,
    setPlannerSlotDraftsByFormatId,
    plannerSlotEditDraftsById,
    setPlannerSlotEditDraftsById,
    deletingPlannerFormat,
    setDeletingPlannerFormat,
    deletingPlannerSlotGroup,
    setDeletingPlannerSlotGroup,
    plannerFormatWeights,
    setPlannerFormatWeights,
    plannerFormatDraftsById,
    setPlannerFormatDraftsById,
    editingPlannerFormatIds,
    setEditingPlannerFormatIds,
    editingPlannerSlotGroupIds,
    setEditingPlannerSlotGroupIds,
    autoPlannerPreview,
    setAutoPlannerPreview,
    calendarPlanImportContent,
    setCalendarPlanImportContent,
    autoPlannerRerollingDate,
    setAutoPlannerRerollingDate,
    autoPlannerRerollOffsetsByDate,
    setAutoPlannerRerollOffsetsByDate,
  };
}

"use client";

import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";
import { useTelegramWorkspaceView } from "./use-telegram-workspace-view";
import { useTelegramCalendarState } from "./use-telegram-calendar-state";
import { useTelegramPostEditorState } from "./use-telegram-post-editor-state";
import { useTelegramPostSidebarState } from "./use-telegram-post-sidebar-state";
import { useTelegramPostPendingState } from "./use-telegram-post-pending-state";
import { useTelegramPostWorkspaceQueries } from "./use-telegram-post-workspace-queries";
import { useTelegramPostEditorContext } from "./use-telegram-post-editor-context";
import { useTelegramWorkspaceSearch } from "./use-telegram-workspace-search";
import { useTelegramCalendarModel } from "./use-telegram-calendar-model";
import { useTelegramPostSidebarList } from "./use-telegram-post-sidebar-list";
import { useTelegramPlannerEditing } from "./use-telegram-planner-editing";
import { useTelegramAutomaticPlanner } from "./use-telegram-automatic-planner";
import { useTelegramManualScheduling } from "./use-telegram-manual-scheduling";
import { useTelegramSidebarPreferences } from "./use-telegram-sidebar-preferences";
import { useTelegramWorkspaceRouteEffects } from "./use-telegram-workspace-route-effects";
import { useTelegramPostSelection } from "./use-telegram-post-selection";
import { createTelegramPostDeletion } from "./create-telegram-post-deletion";
import { useTelegramWorkspaceDeepLinks } from "./use-telegram-workspace-deep-links";
import { createTelegramPostPublication } from "./create-telegram-post-publication";
import { useTelegramPostEditorAutofill } from "./use-telegram-post-editor-autofill";

export function useTelegramPostWorkspace(props: TelegramPostWorkspaceProps) {
  const view = useTelegramWorkspaceView({ ...props });
  const calendarState = useTelegramCalendarState({ ...props });
  const editorState = useTelegramPostEditorState({ ...props });
  const sidebarState = useTelegramPostSidebarState();
  const pendingState = useTelegramPostPendingState();
  const queries = useTelegramPostWorkspaceQueries({
    ...props,
    ...view,
    ...editorState,
    ...calendarState,
  });
  const editorContext = useTelegramPostEditorContext({
    ...view,
    ...props,
    ...queries,
    ...sidebarState,
    ...editorState,
    ...pendingState,
  });
  const search = useTelegramWorkspaceSearch({
    ...queries,
    ...pendingState,
    ...editorState,
    ...editorContext,
  });
  const calendarModel = useTelegramCalendarModel({
    ...calendarState,
    ...queries,
    ...props,
    ...view,
    ...editorContext,
  });
  const sidebarList = useTelegramPostSidebarList({
    ...search,
    ...queries,
    ...editorContext,
    ...sidebarState,
    ...editorState,
    ...props,
    ...view,
  });
  const plannerEditing = useTelegramPlannerEditing({
    ...view,
    ...props,
    ...calendarState,
    ...queries,
    ...calendarModel,
  });
  const automaticPlanner = useTelegramAutomaticPlanner({
    ...calendarState,
    ...calendarModel,
    ...props,
    ...view,
    ...plannerEditing,
    ...editorContext,
  });
  const manualScheduling = useTelegramManualScheduling({
    ...calendarState,
    ...calendarModel,
    ...props,
    ...view,
  });
  const sidebarReorder = useTelegramSidebarPreferences({
    ...sidebarState,
    ...sidebarList,
    ...props,
    ...view,
    ...calendarState,
  });
  useTelegramWorkspaceRouteEffects({
    ...props,
    ...view,
    ...editorState,
    ...calendarState,
    ...sidebarState,
    ...queries,
    ...editorContext,
  });
  const postSelection = useTelegramPostSelection({
    ...props,
    ...editorState,
    ...sidebarList,
    ...view,
    ...pendingState,
    ...editorContext,
    ...sidebarState,
    ...queries,
  });
  const deletion = createTelegramPostDeletion({
    ...view,
    ...props,
    ...editorState,
    ...postSelection,
  });
  useTelegramWorkspaceDeepLinks({
    ...props,
    ...view,
    ...sidebarList,
    ...queries,
    ...editorState,
    ...editorContext,
    ...sidebarState,
    ...postSelection,
  });
  const publication = createTelegramPostPublication({
    ...editorContext,
    ...editorState,
    ...view,
    ...queries,
    ...pendingState,
    ...sidebarList,
    ...props,
    ...postSelection,
  });
  const editorAutofill = useTelegramPostEditorAutofill({
    ...editorState,
    ...editorContext,
  });

  return {
    ...props,
    ...view,
    ...calendarState,
    ...editorState,
    ...sidebarState,
    ...pendingState,
    ...queries,
    ...editorContext,
    ...search,
    ...calendarModel,
    ...sidebarList,
    ...plannerEditing,
    ...automaticPlanner,
    ...manualScheduling,
    ...sidebarReorder,
    ...postSelection,
    ...deletion,
    ...publication,
    ...editorAutofill,
  };
}

export type TelegramPostWorkspaceModel = ReturnType<
  typeof useTelegramPostWorkspace
>;

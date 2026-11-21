"use client";

import { useState, useRef, useMemo } from "react";
import { type TelegramManagedPost } from "@/lib/api";
import type { TelegramTextEditorHandle } from "@/components/features/telegram/telegram/telegram-text-editor";
import {
  type TelegramPostMediaItem,
  telegramPostPhotoUrls,
  type TelegramPostButtonRows,
} from "@telegram-system/shared";
import { type LongTextMode } from "@/components/features/telegram/telegram/managed-post-presentation";
import {
  postGroupPreferenceKey,
  type PublishingMode,
  localNowParts,
  type PostStatusTab,
} from "./telegram-post-workspace-model";
import type { TelegramPostWorkspaceProps } from "./telegram-post-workspace-model";

type Input = Pick<
  TelegramPostWorkspaceProps,
  "channelId" | "workspaceTimezone"
>;

export function useTelegramPostEditorState(input: Input) {
  const { channelId, workspaceTimezone } = input;

  const [editing, setEditing] = useState<TelegramManagedPost | null>(null);

  const [title, setTitle] = useState("");

  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);

  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);

  const [memberSelectionTouched, setMemberSelectionTouched] = useState(false);

  const [text, setText] = useState("");

  const textEditorRef = useRef<TelegramTextEditorHandle | null>(null);

  const [mediaItems, setMediaItems] = useState<TelegramPostMediaItem[]>([]);

  const imageUrls = useMemo(
    () => telegramPostPhotoUrls(mediaItems),
    [mediaItems],
  );

  const [buttonRows, setButtonRows] = useState<TelegramPostButtonRows>([]);

  const [icon, setIcon] = useState<string | null>(null);

  const iconRef = useRef<string | null>(null);

  const iconAutofillRef = useRef<{ active: boolean; emoji: string | null }>({
    active: false,
    emoji: null,
  });

  const iconAutofillRequestRef = useRef(0);

  const [iconPickerGeneration, setIconPickerGeneration] = useState(0);

  const [iconPending, setIconPending] = useState(false);

  const [rememberedPostGroupId, setRememberedPostGroupId] = useState<
    string | null
  >(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(postGroupPreferenceKey(channelId));
  });

  const [postGroupId, setPostGroupId] = useState<string | null>(null);

  const [newPostHypothesisIds, setNewPostHypothesisIds] = useState<string[]>(
    [],
  );

  const [mode, setMode] = useState<PublishingMode>("draft");

  const [scheduleDate, setScheduleDate] = useState(
    () => localNowParts(workspaceTimezone).date,
  );

  const [scheduleTime, setScheduleTime] = useState(
    () => localNowParts(workspaceTimezone).time,
  );

  const [publicationSlotId, setPublicationSlotId] = useState<string | null>(
    null,
  );

  const [deleteAfterHours, setDeleteAfterHours] = useState<number | null>(null);

  const [longTextMode, setLongTextMode] =
    useState<LongTextMode>("IMAGES_THEN_TEXT");

  const [statusTab, setStatusTab] = useState<PostStatusTab>("DRAFT");

  const [busy, setBusy] = useState(false);

  const [uploadingImages, setUploadingImages] = useState(false);

  const [error, setError] = useState("");

  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);

  return {
    editing,
    setEditing,
    title,
    setTitle,
    titleManuallyEdited,
    setTitleManuallyEdited,
    assignedMemberId,
    setAssignedMemberId,
    memberSelectionTouched,
    setMemberSelectionTouched,
    text,
    setText,
    textEditorRef,
    mediaItems,
    setMediaItems,
    imageUrls,
    buttonRows,
    setButtonRows,
    icon,
    setIcon,
    iconRef,
    iconAutofillRef,
    iconAutofillRequestRef,
    iconPickerGeneration,
    setIconPickerGeneration,
    iconPending,
    setIconPending,
    rememberedPostGroupId,
    setRememberedPostGroupId,
    postGroupId,
    setPostGroupId,
    newPostHypothesisIds,
    setNewPostHypothesisIds,
    mode,
    setMode,
    scheduleDate,
    setScheduleDate,
    scheduleTime,
    setScheduleTime,
    publicationSlotId,
    setPublicationSlotId,
    deleteAfterHours,
    setDeleteAfterHours,
    longTextMode,
    setLongTextMode,
    statusTab,
    setStatusTab,
    busy,
    uploadingImages,
    setUploadingImages,
    error,
    setError,
    selectedPostIds,
    setSelectedPostIds,
  };
}

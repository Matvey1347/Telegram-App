"use client";

import { useState, useRef } from "react";
import { type TelegramManagedPostRevision } from "@/lib/api";
import { type PendingPostSave } from "./telegram-post-workspace-model";

export function useTelegramPostPendingState() {
  const [restorePreviewRevision, setRestorePreviewRevision] =
    useState<TelegramManagedPostRevision | null>(null);

  const [restoreConfirmationValue, setRestoreConfirmationValue] = useState("");

  const [pendingPostSaves, setPendingPostSaves] = useState<PendingPostSave[]>(
    [],
  );

  const [creatingPostId, setCreatingPostId] = useState<string | null>(null);

  const creatingPostIdRef = useRef<string | null>(null);

  const [savingPostIds, setSavingPostIds] = useState<string[]>([]);

  return {
    restorePreviewRevision,
    setRestorePreviewRevision,
    restoreConfirmationValue,
    setRestoreConfirmationValue,
    pendingPostSaves,
    setPendingPostSaves,
    creatingPostId,
    setCreatingPostId,
    creatingPostIdRef,
    savingPostIds,
    setSavingPostIds,
  };
}

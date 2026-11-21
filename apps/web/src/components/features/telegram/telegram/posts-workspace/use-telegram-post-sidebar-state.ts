"use client";

import { useState, useRef } from "react";
import { type TelegramManagedPost } from "@/lib/api";

export function useTelegramPostSidebarState() {
  const [usageModalOpen, setUsageModalOpen] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);

  const [highlightedInternalLinkTargetId, setHighlightedInternalLinkTargetId] =
    useState<string | null>(null);

  const [highlightRequestKey, setHighlightRequestKey] = useState(0);

  const [collapsedGroupIdsPreference, setCollapsedGroupIdsPreference] =
    useState<string[] | null>(null);

  const [draggedSidebarKey, setDraggedSidebarKey] = useState<string | null>(
    null,
  );

  const [sidebarOrderKeys, setSidebarOrderKeys] = useState<string[]>([]);

  const sidebarReorderTimerRef = useRef<number | null>(null);

  const sidebarReorderVersionRef = useRef(0);

  const sidebarReorderQueueRef = useRef<Promise<void>>(Promise.resolve());

  const postOpenTimerRef = useRef<number | null>(null);

  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const [deletingPost, setDeletingPost] = useState<TelegramManagedPost | null>(
    null,
  );

  const [movingPost, setMovingPost] = useState<TelegramManagedPost | null>(
    null,
  );

  return {
    usageModalOpen,
    setUsageModalOpen,
    historyOpen,
    setHistoryOpen,
    highlightedInternalLinkTargetId,
    setHighlightedInternalLinkTargetId,
    highlightRequestKey,
    setHighlightRequestKey,
    collapsedGroupIdsPreference,
    setCollapsedGroupIdsPreference,
    draggedSidebarKey,
    setDraggedSidebarKey,
    sidebarOrderKeys,
    setSidebarOrderKeys,
    sidebarReorderTimerRef,
    sidebarReorderVersionRef,
    sidebarReorderQueueRef,
    postOpenTimerRef,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    deletingPost,
    setDeletingPost,
    movingPost,
    setMovingPost,
  };
}

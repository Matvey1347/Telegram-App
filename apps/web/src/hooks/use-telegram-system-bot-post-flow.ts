"use client";

import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE,
  type TelegramSystemBotPostDraft,
  type TelegramSystemBotPostImportMode,
  type TelegramSystemBotPostImportStatus,
} from "@telegram-system/shared";
import { telegramSystemBotApi } from "@/lib/api";
import { useTelegramSystemBotImportConflict } from "@/providers/telegram-system-bot-import-conflict-provider";
import {
  importedValue,
  type ImportedValue,
  type PostImportFlowErrorCopy,
  postImportStorageKey,
  publishPollTerminal,
  readPostImportOnce,
  subscribeToPollLease,
} from "./telegram-post-import-poll-coordinator";

type ActionStatus = "idle" | "working" | "waiting" | "done";

export function useTelegramSystemBotPostFlow<
  M extends TelegramSystemBotPostImportMode,
>({
  mode,
  workspaceId,
  botUsername,
  onImported,
  previewDraft,
  onPreviewSent,
  errorCopy,
  recoveryKey,
  importContext,
  enabled = true,
  openBotOnStart = false,
}: {
  mode: M;
  workspaceId?: string | null;
  botUsername?: string | null;
  onImported?: (
    value: ImportedValue<M>,
    workflowId: string,
  ) => void | Promise<void>;
  previewDraft?: TelegramSystemBotPostDraft | null;
  onPreviewSent?: () => void | Promise<void>;
  errorCopy?: PostImportFlowErrorCopy;
  recoveryKey?: string;
  importContext?: string;
  enabled?: boolean;
  openBotOnStart?: boolean;
}) {
  const confirmImportReplacement = useTelegramSystemBotImportConflict();
  const activeError = errorCopy?.active;
  const readError = errorCopy?.read;
  const startError = errorCopy?.start;
  const cancelError = errorCopy?.cancel;
  const previewError = errorCopy?.preview;
  const recoveryOwner = recoveryKey?.trim() || undefined;
  const latest = useRef({ mode, onImported, onPreviewSent, previewDraft });
  const pollInstanceId = useRef(Symbol("telegram-post-import-poller"));
  const [leaseVersion, setLeaseVersion] = useState(0);
  useEffect(() => {
    latest.current = { mode, onImported, onPreviewSent, previewDraft };
  }, [mode, onImported, onPreviewSent, previewDraft]);
  const checkingRef = useRef(false);
  const pollDeadlineRef = useRef(0);
  const pollStartedAtRef = useRef(0);
  const workflowIdRef = useRef("");
  const key = workspaceId ? postImportStorageKey(workspaceId, mode) : undefined;
  const keyRef = useRef(key);
  const [workflowId, setWorkflowId] = useState("");
  const [importStatus, setImportStatus] = useState<ActionStatus>("idle");
  const [terminalStatus, setTerminalStatus] =
    useState<TelegramSystemBotPostImportStatus | null>(null);
  const [sendStatus, setSendStatus] = useState<ActionStatus>("idle");
  const [error, setError] = useState("");
  const [dots, setDots] = useState(1);

  const clearWorkflow = useCallback(
    (status?: TelegramSystemBotPostImportStatus) => {
      const currentKey = keyRef.current;
      const currentWorkflowId = workflowIdRef.current;
      if (
        currentKey &&
        window.localStorage.getItem(currentKey) === currentWorkflowId
      ) {
        window.localStorage.removeItem(currentKey);
        window.localStorage.removeItem(`${currentKey}:owner`);
      }
      workflowIdRef.current = "";
      pollDeadlineRef.current = 0;
      pollStartedAtRef.current = 0;
      setWorkflowId("");
      if (status) setTerminalStatus(status);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const storedOwner = key
        ? window.localStorage.getItem(`${key}:owner`)
        : null;
      const ownsRecovery = !recoveryOwner || storedOwner === recoveryOwner;
      const restored =
        key && ownsRecovery ? window.localStorage.getItem(key) || "" : "";
      keyRef.current = key;
      checkingRef.current = false;
      pollStartedAtRef.current = restored ? Date.now() : 0;
      pollDeadlineRef.current = restored ? Date.now() + 120_000 : 0;
      workflowIdRef.current = restored;
      setWorkflowId(restored);
      setImportStatus(restored ? "waiting" : "idle");
      setTerminalStatus(null);
      setError("");
    });
    return () => {
      cancelled = true;
    };
  }, [key, recoveryOwner]);

  useEffect(() => {
    if (importStatus !== "working" && sendStatus !== "working") return;
    const interval = window.setInterval(
      () => setDots((value) => (value % 3) + 1),
      350,
    );
    return () => window.clearInterval(interval);
  }, [importStatus, sendStatus]);

  const checkImport = useCallback(async () => {
    const checkedWorkflowId = workflowIdRef.current;
    if (!checkedWorkflowId || checkingRef.current) return false;
    const checkedKey = keyRef.current;
    const isCurrent = () =>
      keyRef.current === checkedKey &&
      workflowIdRef.current === checkedWorkflowId;
    checkingRef.current = true;
    try {
      const result = await readPostImportOnce(checkedWorkflowId);
      if (!isCurrent()) return false;
      if (result.status !== "ACTIVE") {
        if (result.ready) {
          await latest.current.onImported?.(
            importedValue(latest.current.mode, result.drafts),
            checkedWorkflowId,
          );
          if (!isCurrent()) return false;
          publishPollTerminal(
            checkedKey,
            pollInstanceId.current,
            checkedWorkflowId,
            "COMPLETED",
          );
          clearWorkflow("COMPLETED");
          setImportStatus("done");
          setError("");
          return true;
        }
        publishPollTerminal(
          checkedKey,
          pollInstanceId.current,
          checkedWorkflowId,
          result.status,
        );
        clearWorkflow(result.status);
        setImportStatus("idle");
        setError(
          result.status === "CANCELLED"
            ? ""
            : (readError ?? "The bot post import did not complete."),
        );
        return true;
      }
      setImportStatus("waiting");
      return false;
    } catch {
      if (!isCurrent()) return false;
      setImportStatus("waiting");
      setError(readError ?? "Could not load the post from the system bot.");
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, [clearWorkflow, readError]);

  useEffect(() => {
    if (!enabled || !workflowId || importStatus === "done") return;
    if (!key) return;
    const lease = subscribeToPollLease(key, pollInstanceId.current, {
      wake: () => setLeaseVersion((version) => version + 1),
      terminal: (finishedWorkflowId, status) => {
        if (workflowIdRef.current !== finishedWorkflowId) return;
        clearWorkflow(status);
        setImportStatus(status === "COMPLETED" ? "done" : "idle");
      },
    });
    if (!lease.ownsLease) return lease.release;
    let disposed = false;
    let timeout: number | undefined;
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
    const clearTimer = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = undefined;
    };
    const schedule = (delay: number) => {
      clearTimer();
      if (
        disposed ||
        document.visibilityState === "hidden" ||
        Date.now() >= pollDeadlineRef.current
      )
        return;
      timeout = window.setTimeout(async () => {
        timeout = undefined;
        const terminal = await checkImport();
        if (!terminal)
          schedule(
            Date.now() - pollStartedAtRef.current < 10_000 ? 1_000 : 3_000,
          );
      }, delay);
    };
    const reconcileVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt ||= Date.now();
        clearTimer();
        return;
      }
      if (hiddenAt) {
        pollDeadlineRef.current += Date.now() - hiddenAt;
        hiddenAt = 0;
      }
      schedule(0);
    };
    schedule(1_000);
    window.addEventListener("focus", reconcileVisibility);
    document.addEventListener("visibilitychange", reconcileVisibility);
    return () => {
      disposed = true;
      clearTimer();
      lease.release();
      window.removeEventListener("focus", reconcileVisibility);
      document.removeEventListener("visibilitychange", reconcileVisibility);
    };
  }, [
    checkImport,
    clearWorkflow,
    enabled,
    importStatus,
    key,
    leaseVersion,
    workflowId,
  ]);

  useEffect(() => {
    if (sendStatus !== "done") return;
    const timeout = window.setTimeout(() => setSendStatus("idle"), 1_800);
    return () => window.clearTimeout(timeout);
  }, [sendStatus]);

  const startImport = useCallback(async () => {
    if (!workspaceId || importStatus === "working") return false;
    const replaceKnownImport = Boolean(workflowIdRef.current);
    if (replaceKnownImport) {
      const confirmed = await confirmImportReplacement();
      if (!confirmed) return false;
    }
    setError("");
    setDots(1);
    setTerminalStatus(null);
    setImportStatus("working");
    try {
      const payload = {
        mode,
        ...(importContext?.trim() ? { context: importContext.trim() } : {}),
      };
      let started;
      if (replaceKnownImport) {
        started = await telegramSystemBotApi.startPostImport({
          ...payload,
          replaceActive: true,
        });
      } else {
        try {
          started = await telegramSystemBotApi.startPostImport(payload);
        } catch (caught) {
          const active =
            axios.isAxiosError(caught) &&
            caught.response?.data?.code ===
              TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE;
          if (!active) throw caught;
          setImportStatus("idle");
          if (!(await confirmImportReplacement())) {
            setError(
              activeError ??
                "Finish or cancel the current bot post import first.",
            );
            return false;
          }
          setImportStatus("working");
          started = await telegramSystemBotApi.startPostImport({
            ...payload,
            replaceActive: true,
          });
        }
      }
      if (!started.workflowId)
        throw new Error("Import workflow was not prepared");
      pollStartedAtRef.current = Date.now();
      pollDeadlineRef.current = Date.now() + 120_000;
      workflowIdRef.current = started.workflowId;
      if (keyRef.current && recoveryOwner)
        window.localStorage.setItem(`${keyRef.current}:owner`, recoveryOwner);
      if (keyRef.current)
        window.localStorage.setItem(keyRef.current, started.workflowId);
      setWorkflowId(started.workflowId);
      setImportStatus("waiting");
      const username = botUsername?.trim().replace(/^@+/, "");
      if (username && openBotOnStart)
        window.open(
          `https://t.me/${encodeURIComponent(username)}`,
          "_blank",
          "noopener,noreferrer",
        );
      return true;
    } catch {
      setImportStatus("idle");
      setError(startError ?? "Could not start the bot post import.");
      return false;
    }
  }, [
    activeError,
    botUsername,
    confirmImportReplacement,
    importStatus,
    importContext,
    mode,
    openBotOnStart,
    recoveryOwner,
    startError,
    workspaceId,
  ]);

  const cancelImport = useCallback(async () => {
    const current = workflowIdRef.current;
    if (!current) {
      setImportStatus("idle");
      setSendStatus("idle");
      setError("");
      return;
    }
    setImportStatus("working");
    setError("");
    try {
      await telegramSystemBotApi.cancelPostImport(current);
      if (workflowIdRef.current !== current) return;
      publishPollTerminal(
        keyRef.current,
        pollInstanceId.current,
        current,
        "CANCELLED",
      );
      clearWorkflow("CANCELLED");
      setImportStatus("idle");
    } catch (caught) {
      if (axios.isAxiosError(caught) && caught.response?.status === 404) {
        publishPollTerminal(
          keyRef.current,
          pollInstanceId.current,
          current,
          "CANCELLED",
        );
        clearWorkflow("CANCELLED");
        setImportStatus("idle");
        return;
      }
      if (workflowIdRef.current === current) {
        if (keyRef.current)
          window.localStorage.setItem(keyRef.current, current);
        setWorkflowId(current);
        setImportStatus("waiting");
      }
      setError(cancelError ?? "Could not cancel the bot post import.");
    }
  }, [cancelError, clearWorkflow]);

  const send = useCallback(
    async (draftOverride?: TelegramSystemBotPostDraft) => {
      const draft = draftOverride ?? latest.current.previewDraft;
      if (!draft || sendStatus === "working") return;
      setError("");
      setDots(1);
      setSendStatus("working");
      try {
        await telegramSystemBotApi.sendPostPreview(draft);
        await latest.current.onPreviewSent?.();
        setSendStatus("done");
      } catch {
        setSendStatus("idle");
        setError(previewError ?? "Could not send the post to the bot.");
      }
    },
    [previewError, sendStatus],
  );

  const reset = useCallback(async () => {
    await cancelImport();
    setTerminalStatus(null);
    setSendStatus("idle");
  }, [cancelImport]);

  return {
    workflowId,
    importStatus,
    terminalStatus,
    sendStatus,
    error,
    dots,
    startImport,
    checkImport,
    cancelImport,
    send,
    reset,
  };
}

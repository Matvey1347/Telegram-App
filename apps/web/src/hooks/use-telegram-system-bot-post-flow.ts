"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ImportResult<T> = { ready: false } | { ready: true; value: T };
type ActionStatus = "idle" | "working" | "waiting" | "done";

export function useTelegramSystemBotPostFlow<T>({
  prepareImport,
  readImport,
  onImported,
  sendPreview,
  botUsername,
  importErrorMessage,
  startImportErrorMessage,
  sendErrorMessage,
  resolveImportError,
  openBotOnStart = true,
  storageKey,
}: {
  prepareImport?: () => Promise<string>;
  readImport?: (workflowId: string) => Promise<ImportResult<T>>;
  onImported?: (value: T) => void | Promise<void>;
  sendPreview?: () => Promise<unknown>;
  botUsername?: string | null;
  importErrorMessage?: string;
  startImportErrorMessage?: string;
  sendErrorMessage?: string;
  resolveImportError?: (error: unknown) => string;
  openBotOnStart?: boolean;
  storageKey?: string;
}) {
  const latest = useRef({ readImport, onImported });
  useEffect(() => {
    latest.current = { readImport, onImported };
  }, [onImported, readImport]);
  const checkingRef = useRef(false);
  const pollDeadlineRef = useRef(0);
  const pollStartedAtRef = useRef(0);
  const workflowIdRef = useRef("");
  const storageKeyRef = useRef(storageKey);
  const restoredStorageKeyRef = useRef<string | undefined>(undefined);
  const [workflowId, setWorkflowId] = useState("");
  const [importStatus, setImportStatus] = useState<ActionStatus>("idle");
  const [sendStatus, setSendStatus] = useState<ActionStatus>("idle");
  const [error, setError] = useState("");
  const [dots, setDots] = useState(1);

  useEffect(() => {
    storageKeyRef.current = storageKey;
    if (!storageKey || restoredStorageKeyRef.current === storageKey) return;
    restoredStorageKeyRef.current = storageKey;
    pollDeadlineRef.current = 0;
    const workflowAtRestoreStart = workflowIdRef.current;
    const timeout = window.setTimeout(() => {
      if (
        storageKeyRef.current !== storageKey ||
        workflowIdRef.current !== workflowAtRestoreStart
      )
        return;
      checkingRef.current = false;
      const restoredWorkflowId =
        window.localStorage.getItem(storageKey) || "";
      workflowIdRef.current = restoredWorkflowId;
      pollStartedAtRef.current = Date.now();
      pollDeadlineRef.current = restoredWorkflowId
        ? Date.now() + 120_000
        : 0;
      setWorkflowId(restoredWorkflowId);
      setImportStatus(restoredWorkflowId ? "waiting" : "idle");
      setError("");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [storageKey]);

  useEffect(() => {
    if (importStatus !== "working" && sendStatus !== "working") return;
    const interval = window.setInterval(
      () => setDots((value) => (value % 3) + 1),
      350,
    );
    return () => window.clearInterval(interval);
  }, [importStatus, sendStatus]);

  const checkImport = useCallback(async () => {
    if (!workflowId || checkingRef.current || !latest.current.readImport)
      return false;
    const checkedWorkflowId = workflowId;
    const checkedStorageKey = storageKeyRef.current;
    const checkedReadImport = latest.current.readImport;
    const checkedOnImported = latest.current.onImported;
    const isCurrentCheck = () =>
      storageKeyRef.current === checkedStorageKey &&
      workflowIdRef.current === checkedWorkflowId;
    checkingRef.current = true;
    try {
      const result = await checkedReadImport(checkedWorkflowId);
      if (!isCurrentCheck()) return false;
      if (!result.ready) {
        setImportStatus("waiting");
        return false;
      }
      await checkedOnImported?.(result.value);
      if (!isCurrentCheck()) return false;
      if (
        checkedStorageKey &&
        window.localStorage.getItem(checkedStorageKey) === checkedWorkflowId
      ) {
        window.localStorage.removeItem(checkedStorageKey);
      }
      workflowIdRef.current = "";
      setWorkflowId("");
      setImportStatus("done");
      setError("");
      return true;
    } catch {
      if (!isCurrentCheck()) return false;
      setImportStatus("waiting");
      setError(
        importErrorMessage ?? "Could not load the post from the system bot.",
      );
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, [importErrorMessage, workflowId]);

  useEffect(() => {
    if (!workflowId || importStatus === "done") return;
    let cancelled = false;
    let timeout: number | undefined;
    let hiddenAt =
      document.visibilityState === "hidden" ? Date.now() : undefined;
    const clearScheduledCheck = () => {
      if (timeout === undefined) return;
      window.clearTimeout(timeout);
      timeout = undefined;
    };
    const schedule = (delay: number) => {
      clearScheduledCheck();
      if (
        cancelled ||
        document.visibilityState === "hidden" ||
        Date.now() >= pollDeadlineRef.current
      )
        return;
      timeout = window.setTimeout(async () => {
        timeout = undefined;
        if (Date.now() >= pollDeadlineRef.current) return;
        const ready = await checkImport();
        if (!ready) {
          const elapsed = Date.now() - pollStartedAtRef.current;
          schedule(elapsed < 10_000 ? 500 : 1_500);
        }
      }, delay);
    };
    const checkOnReturn = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt ??= Date.now();
        clearScheduledCheck();
        return;
      }
      if (hiddenAt !== undefined) {
        pollDeadlineRef.current += Date.now() - hiddenAt;
        hiddenAt = undefined;
      }
      schedule(0);
    };
    schedule(250);
    window.addEventListener("focus", checkOnReturn);
    document.addEventListener("visibilitychange", checkOnReturn);
    return () => {
      cancelled = true;
      clearScheduledCheck();
      window.removeEventListener("focus", checkOnReturn);
      document.removeEventListener("visibilitychange", checkOnReturn);
    };
  }, [checkImport, importStatus, workflowId]);

  useEffect(() => {
    if (sendStatus !== "done") return;
    const timeout = window.setTimeout(() => setSendStatus("idle"), 1_800);
    return () => window.clearTimeout(timeout);
  }, [sendStatus]);

  const startImport = useCallback(async () => {
    if (!prepareImport || importStatus === "working") return;
    setError("");
    setDots(1);
    setImportStatus("working");
    try {
      const nextWorkflowId = await prepareImport();
      if (!nextWorkflowId) throw new Error("Import workflow was not prepared");
      pollDeadlineRef.current = Date.now() + 120_000;
      pollStartedAtRef.current = Date.now();
      workflowIdRef.current = nextWorkflowId;
      if (storageKeyRef.current) {
        window.localStorage.setItem(storageKeyRef.current, nextWorkflowId);
      }
      setWorkflowId(nextWorkflowId);
      setImportStatus("waiting");
      const username = botUsername?.trim().replace(/^@+/, "");
      if (username && openBotOnStart) {
        window.open(
          `https://t.me/${encodeURIComponent(username)}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
    } catch (caught) {
      setImportStatus("idle");
      setError(
        resolveImportError?.(caught) ??
          startImportErrorMessage ??
          importErrorMessage ??
          "Could not start the bot post import.",
      );
    }
  }, [
    botUsername,
    importErrorMessage,
    importStatus,
    openBotOnStart,
    prepareImport,
    resolveImportError,
    startImportErrorMessage,
  ]);

  const send = useCallback(async () => {
    if (!sendPreview || sendStatus === "working") return;
    setError("");
    setDots(1);
    setSendStatus("working");
    try {
      await sendPreview();
      setSendStatus("done");
    } catch {
      setSendStatus("idle");
      setError(sendErrorMessage ?? "Could not send the post to the bot.");
    }
  }, [sendErrorMessage, sendPreview, sendStatus]);

  const reset = useCallback(() => {
    checkingRef.current = false;
    pollDeadlineRef.current = 0;
    pollStartedAtRef.current = 0;
    workflowIdRef.current = "";
    if (storageKeyRef.current) {
      window.localStorage.removeItem(storageKeyRef.current);
    }
    setWorkflowId("");
    setImportStatus("idle");
    setSendStatus("idle");
    setError("");
  }, []);

  return {
    workflowId,
    importStatus,
    sendStatus,
    error,
    dots,
    startImport,
    checkImport,
    send,
    reset,
  };
}

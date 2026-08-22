"use client";

import { CircleCheck, CircleX, Info, X } from "lucide-react";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import financeStyles from "./finance-ui.module.css";

type FinanceToastTone = "success" | "error" | "info";
type FinanceToast = {
  id: number;
  message: string;
  tone: FinanceToastTone;
};

const FINANCE_TOAST_DISMISS_MS = 4_000;
const FINANCE_TOAST_DEDUPE_MS = 5_000;

const FinanceFeedbackContext = createContext<{
  pushToast: (
    message: string,
    tone?: FinanceToastTone,
    durationMs?: number,
  ) => void;
} | null>(null);

export function FinanceFeedbackProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<FinanceToast[]>([]);
  const sequence = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());
  const recentToasts = useRef<Map<string, number>>(new Map());
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let element = document.getElementById("consumer-finance-notifications");
    if (!element) {
      element = document.createElement("div");
      element.id = "consumer-finance-notifications";
      document.body.appendChild(element);
    }
    element.className = `${financeStyles.themeRoot} ${financeStyles.toastHost} fixed z-[200] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 pointer-events-none`;
    setHost(element);
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => window.clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: FinanceToastTone = "info", durationMs?: number) => {
      const key = `${tone}:${message.trim()}`;
      const now = Date.now();
      const previous = recentToasts.current.get(key);
      if (previous && now - previous < FINANCE_TOAST_DEDUPE_MS) return;
      recentToasts.current.set(key, now);
      for (const [entryKey, createdAt] of recentToasts.current.entries()) {
        if (now - createdAt >= FINANCE_TOAST_DEDUPE_MS) {
          recentToasts.current.delete(entryKey);
        }
      }
      sequence.current += 1;
      const id = sequence.current;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        window.setTimeout(
          () => dismiss(id),
          durationMs ?? FINANCE_TOAST_DISMISS_MS,
        ),
      );
    },
    [dismiss],
  );

  return (
    <FinanceFeedbackContext.Provider value={{ pushToast }}>
      {children}
      {host
        ? createPortal(
            toasts.map((toast) => (
              <FinanceToastCard
                key={toast.id}
                toast={toast}
                onClose={() => dismiss(toast.id)}
              />
            )),
            host,
          )
        : null}
    </FinanceFeedbackContext.Provider>
  );
}

function FinanceToastCard({
  toast,
  onClose,
}: {
  toast: FinanceToast;
  onClose: () => void;
}) {
  const styles = {
    success: "border-emerald-700/70 bg-emerald-950/95 text-emerald-300",
    error: "border-red-700/70 bg-red-950/95 text-red-300",
    info: "border-blue-700/70 bg-neutral-950/95 text-blue-300",
  }[toast.tone];
  const Icon =
    toast.tone === "success"
      ? CircleCheck
      : toast.tone === "error"
        ? CircleX
        : Info;
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={`${financeStyles.toast} pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-2xl backdrop-blur-md ${styles}`}
    >
      <Icon size={19} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-5 text-neutral-200">
        {toast.message}
      </p>
      <button
        type="button"
        aria-label="Close notification"
        onClick={onClose}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function useFinanceFeedback() {
  const context = useContext(FinanceFeedbackContext);
  if (!context)
    throw new Error(
      "useFinanceFeedback must be used within FinanceFeedbackProvider",
    );
  return context;
}

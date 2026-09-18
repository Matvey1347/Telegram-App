"use client";

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Modal } from "@/components/ui/primitives";

type ResolveConfirmation = (confirmed: boolean) => void;
const declineReplacement = () => Promise.resolve(false);

const TelegramSystemBotImportConflictContext = createContext<
  (() => Promise<boolean>) | null
>(null);

export function TelegramSystemBotImportConflictProvider({
  children,
}: PropsWithChildren) {
  const resolverRef = useRef<ResolveConfirmation | null>(null);
  const [open, setOpen] = useState(false);

  const finish = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    resolve?.(confirmed);
  }, []);

  const confirmReplacement = useCallback(() => {
    resolverRef.current?.(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(
    () => () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    },
    [],
  );

  return (
    <TelegramSystemBotImportConflictContext.Provider value={confirmReplacement}>
      {children}
      <Modal
        open={open}
        onClose={() => finish(false)}
        title="Replace active bot import?"
        size="xs"
      >
        <p className="text-sm leading-6 text-neutral-300">
          An unfinished bot post import already exists. Starting a new import
          will cancel and delete the previous one. Do you want to continue?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => finish(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => finish(true)}>
            Replace import
          </Button>
        </div>
      </Modal>
    </TelegramSystemBotImportConflictContext.Provider>
  );
}

export function useTelegramSystemBotImportConflict() {
  const confirmReplacement = useContext(TelegramSystemBotImportConflictContext);
  return confirmReplacement ?? declineReplacement;
}

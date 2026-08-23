"use client";

import type {
  TelegramQrLoginAccount,
  TelegramQrLoginProgress,
} from "@telegram-system/shared";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, Modal } from "@/components/ui/primitives";

type TelegramQrCodeProgress = Extract<
  TelegramQrLoginProgress,
  { type: "qr" }
>;

function qrLoginErrorMessage(error: unknown) {
  const responseError = error as {
    message?: string;
    response?: { data?: { message?: string } };
  };
  return (
    responseError.response?.data?.message ||
    responseError.message ||
    "Could not start QR authorization. Please try again."
  );
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error as { name?: string })?.name === "AbortError"
  );
}

export function TelegramAccountQrModal({
  open,
  account,
  onClose,
  onConnected,
  onNeedPassword,
}: {
  open: boolean;
  account: TelegramUserAccount | null;
  onClose: () => void;
  onConnected: (account: TelegramQrLoginAccount) => void;
  onNeedPassword: () => void;
}) {
  if (!open || !account) return null;

  return (
    <TelegramAccountQrAttempt
      key={account.id}
      account={account}
      onClose={onClose}
      onConnected={onConnected}
      onNeedPassword={onNeedPassword}
    />
  );
}

function TelegramAccountQrAttempt({
  account,
  onClose,
  onConnected,
  onNeedPassword,
}: {
  account: TelegramUserAccount;
  onClose: () => void;
  onConnected: (account: TelegramQrLoginAccount) => void;
  onNeedPassword: () => void;
}) {
  const [qr, setQr] = useState<TelegramQrCodeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const attemptRef = useRef(0);
  const onConnectedRef = useRef(onConnected);
  const onNeedPasswordRef = useRef(onNeedPassword);

  useEffect(() => {
    onConnectedRef.current = onConnected;
    onNeedPasswordRef.current = onNeedPassword;
  }, [onConnected, onNeedPassword]);

  useEffect(() => {
    const controller = new AbortController();
    const attempt = ++attemptRef.current;
    controllerRef.current = controller;

    void telegramUserAccountsApi
      .loginWithQr(
        account.id,
        (progress) => {
          if (
            attemptRef.current !== attempt ||
            controller.signal.aborted
          ) return;
          if (progress.type === "connected") {
            attemptRef.current += 1;
            setQr(null);
            onConnectedRef.current(progress.account);
            controller.abort();
            return;
          }
          setQr(progress);
        },
        controller.signal,
      )
      .then((result) => {
        if (
          attemptRef.current !== attempt ||
          controller.signal.aborted
        ) {
          return;
        }
        if (result.status === "needs_password") {
          setQr(null);
          onNeedPasswordRef.current();
          return;
        }
        setQr(null);
        onConnectedRef.current(result.account);
      })
      .catch((requestError: unknown) => {
        if (
          attemptRef.current !== attempt ||
          controller.signal.aborted ||
          isAbortError(requestError)
        ) {
          return;
        }
        setQr(null);
        setError(qrLoginErrorMessage(requestError));
      });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [account.id, retryKey]);

  const close = () => {
    attemptRef.current += 1;
    controllerRef.current?.abort();
    setQr(null);
    onClose();
  };
  const retry = () => {
    attemptRef.current += 1;
    controllerRef.current?.abort();
    setQr(null);
    setError(null);
    setRetryKey((current) => current + 1);
  };

  return (
    <Modal
      open
      onClose={close}
      title={`Link Telegram: ${account.label}`}
      size="sm"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-700 bg-neutral-950 p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-neutral-200">
            <li>Open Telegram on your phone.</li>
            <li>Go to Settings, then Devices.</li>
            <li>Choose Link Desktop Device and scan this code.</li>
          </ol>
        </div>

        <div
          className="flex min-h-64 items-center justify-center rounded-lg border border-neutral-700 bg-white p-4"
          aria-live="polite"
          aria-label={qr ? "Telegram login QR code" : undefined}
          role={qr ? "img" : undefined}
        >
          {error ? (
            <div className="max-w-sm text-center text-sm text-rose-700">
              <p role="alert">{error}</p>
            </div>
          ) : qr ? (
            <QRCodeSVG
              value={qr.loginUrl}
              size={240}
              level="M"
              marginSize={1}
              className="h-auto max-w-full"
              aria-hidden="true"
            />
          ) : (
            <p className="text-sm text-neutral-700" role="status">
              Preparing QR code…
            </p>
          )}
        </div>

        {!error ? (
          <p className="text-center text-xs text-neutral-400">
            Keep this window open. The QR code refreshes automatically when it
            expires.
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={close}>
            Cancel
          </Button>
          {error ? (
            <Button type="button" onClick={retry}>
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

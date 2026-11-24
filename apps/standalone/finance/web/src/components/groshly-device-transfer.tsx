"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Laptop, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";
import { normalizeFinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";

const transferParameter = "deviceLogin";
const isTransferCode = (code: string) => /^[A-Za-z0-9_-]{43}$/u.test(code);

export function GroshlyCreateDeviceTransfer({ botId, locale }: { botId: string; locale: string }) {
  const copy = financeAuthCopy(normalizeFinanceLocale(locale));
  const [open, setOpen] = useState(false);
  const transfer = useMutation({
    mutationFn: () => consumerFinanceAuthApi.createBrowserTransfer(botId),
    gcTime: 0,
  });
  const code = transfer.data?.token;
  const loginUrl = code ? new URL(`/login#${transferParameter}=${code}`, window.location.origin).href : null;

  return (
    <div className="setting-group">
      <button type="button" className="setting-row" aria-expanded={open} onClick={() => {
        if (open) transfer.reset();
        setOpen(!open);
      }}>
        <Smartphone size={21} aria-hidden="true" /><span>{copy.deviceTransferOpen}</span>
      </button>
      {open && (
        <div className="groshly-device-transfer">
          <p>{copy.deviceTransferSafety}</p>
          <button type="button" className="btn secondary" disabled={transfer.isPending} onClick={() => transfer.mutate()}>
            {copy.deviceTransferGenerate}
          </button>
          {transfer.isError && <p role="alert">{copy.deviceTransferError}</p>}
          {code && loginUrl && (
            <>
              <QRCodeSVG value={loginUrl} title={copy.deviceTransferQr} size={176} marginSize={4} />
              <label>
                {copy.deviceTransferCode}
                <input value={code} readOnly onFocus={(event) => event.target.select()} spellCheck={false} />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function GroshlyDeviceTransferLogin({ botId, locale, onAuthenticated }: {
  botId: string;
  locale: string;
  onAuthenticated: () => void;
}) {
  const copy = financeAuthCopy(normalizeFinanceLocale(locale));
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const scanned = fragment.get(transferParameter);
    if (scanned === null) return;
    fragment.delete(transferParameter);
    url.hash = fragment.toString();
    window.history.replaceState(window.history.state, "", url);
    queueMicrotask(() => {
      setOpen(true);
      if (isTransferCode(scanned)) setCode(scanned);
    });
  }, []);
  const transfer = useMutation({
    gcTime: 0,
    mutationFn: async (token: string) => {
      const result = await consumerFinanceAuthApi.consumeBrowserTransfer(botId, token);
      if (!result.authenticated) throw new Error("Device transfer did not return a session");
    },
    onSuccess: onAuthenticated,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTransferCode(code.trim()) && !transfer.isPending) transfer.mutate(code.trim());
  }

  return (
    <div className="groshly-device-transfer-login">
      <button type="button" className="groshly-login-back" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Laptop size={17} aria-hidden="true" />{copy.deviceTransferUse}
      </button>
      {open && (
        <form className="groshly-device-transfer" onSubmit={submit}>
          <p>{copy.deviceTransferHelp}</p>
          <label>
            {copy.deviceTransferCode}
            <input value={code} onChange={(event) => setCode(event.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={64} />
          </label>
          <button type="submit" className="groshly-login-button" disabled={!isTransferCode(code.trim()) || transfer.isPending}>{copy.continue}</button>
          {transfer.isError && <p role="alert">{copy.deviceTransferError}</p>}
        </form>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button, Modal } from "./ui";
import { type FinanceLocale } from "./i18n/core";
import { financeConfirmCopy } from "./i18n/confirm";

export function FinanceConfirmModal({
  open,
  locale,
  entityName,
  actionLabel,
  description,
  onClose,
  onConfirm,
}: {
  open: boolean;
  locale: FinanceLocale;
  entityName: string;
  actionLabel: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
}) {
  const t = financeConfirmCopy(locale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const close = () => {
    setError(false);
    onClose();
  };
  const submit = async () => {
    setPending(true);
    setError(false);
    try {
      await onConfirm();
      close();
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : close}
      title={t.confirmAction}
      closeLabel={t.close}
    >
      <p className="mb-2 text-sm text-neutral-300">
        <span className="font-semibold text-white">{entityName}</span>
      </p>
      <p className="mb-3 text-sm text-amber-300">{description}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="cancel" disabled={pending} onClick={close}>
          {t.cancel}
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? t.confirming : actionLabel}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-rose-300">{t.confirmError}</p>
      ) : null}
    </Modal>
  );
}

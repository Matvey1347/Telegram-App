"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { financeCopy, type FinanceLocale } from "./finance-i18n";

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
  const t = financeCopy(locale);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const close = () => {
    setValue("");
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
        {t.confirmInstruction}{" "}
        <span className="font-semibold text-white">{entityName}</span>
      </p>
      <p className="mb-3 text-sm text-amber-300">{description}</p>
      <Input
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(false);
        }}
        placeholder={entityName}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" disabled={pending} onClick={close}>
          {t.cancel}
        </Button>
        <Button
          variant="danger"
          disabled={value !== entityName || pending}
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

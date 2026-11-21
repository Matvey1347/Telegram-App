"use client";

import { Trash2 } from "lucide-react";
import { Modal } from "./modal";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { Button } from "./buttons";

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  entityName,
  label,
  description,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  entityName: string;
  label?: string;
  description?: string;
}) {
  if (!open) return null;
  return (
    <ConfirmDeleteModalContent
      onClose={onClose}
      onConfirm={onConfirm}
      entityName={entityName}
      label={label}
      description={description}
    />
  );
}

function ConfirmDeleteModalContent({
  onClose,
  onConfirm,
  entityName,
  label,
  description,
}: {
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  entityName: string;
  label?: string;
  description?: string;
}) {
  const t = useOptionalI18n()?.t;
  const resolvedLabel =
    label ?? t?.("common.confirmDeletion") ?? "Confirm deletion";
  return (
    <Modal
      open
      onClose={onClose}
      title={t?.("common.confirmDeletion") ?? "Confirm deletion"}
      titleIcon={<Trash2 size={18} aria-hidden="true" />}
    >
      <p className="mb-3 text-sm text-neutral-300">
        {t?.("common.deleteConfirmationQuestion", { name: entityName }) ??
          `Are you sure you want to delete ${entityName}?`}
      </p>
      {description ? (
        <p className="mb-3 text-sm text-amber-300">{description}</p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t?.("common.cancel") ?? "Cancel"}
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onClose();
            void Promise.resolve(onConfirm()).catch(() => undefined);
          }}
        >
          <span className="inline-flex items-center gap-2">
            {resolvedLabel}
          </span>
        </Button>
      </div>
    </Modal>
  );
}

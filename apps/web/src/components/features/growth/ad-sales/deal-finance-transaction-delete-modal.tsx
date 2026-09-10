"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/components/ui/primitives";

const confirmation = "finance transaction";

export function DealFinanceTransactionDeleteModal({
  dealAmount,
  currency,
  onClose,
  onConfirm,
}: {
  dealAmount: string;
  currency: string;
  onClose: () => void;
  onConfirm: (clearDealAmount: boolean) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [clearDealAmount, setClearDealAmount] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <Modal open onClose={onClose} title="Delete finance transaction">
      <p className="text-sm text-neutral-300">
        The linked Finance transaction and payment record will be deleted.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3.5">
        <input
          type="checkbox"
          aria-label="Also clear the deal value"
          checked={clearDealAmount}
          onChange={(event) => setClearDealAmount(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-blue-500"
        />
        <span>
          <span className="block text-sm font-medium text-white">
            Also clear the deal value
          </span>
          <span className="mt-0.5 block text-xs leading-5 text-neutral-400">
            Sets all placement prices to zero. Current deal value: {dealAmount}{" "}
            {currency}.
          </span>
        </span>
      </label>
      <p className="mb-2 mt-4 text-sm text-neutral-300">
        Type {confirmation} to confirm deletion.
      </p>
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={confirmation}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={saving || value !== confirmation}
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm(clearDealAmount);
              onClose();
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Deleting…" : "Delete transaction"}
        </Button>
      </div>
    </Modal>
  );
}

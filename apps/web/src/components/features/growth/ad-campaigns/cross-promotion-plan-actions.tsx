"use client";

import { Plus, Save } from "lucide-react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import type { CrossPromotionModalMode } from "./cross-promotion-modal-title";

export function CrossPromotionPlanActions({
  status, mode, saving, savingDraft, hasTitle, onSaveDraft, onSubmit,
}: {
  status?: CrossPromotionPlan["status"];
  mode: CrossPromotionModalMode;
  saving: boolean;
  savingDraft: boolean;
  hasTitle: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
}) {
  const editing = mode === "edit";
  const Icon = editing ? Save : Plus;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {!editing && (
        <Button type="button" variant="secondary" disabled={saving || savingDraft} onClick={onSaveDraft}>
          <Save size={16} aria-hidden="true" />
          {savingDraft ? "Saving draft…" : "Save draft"}
        </Button>
      )}
      <Button type="button" disabled={saving || savingDraft || (editing && !hasTitle)} onClick={onSubmit}>
        <Icon size={16} aria-hidden="true" />
        {editing ? saving || savingDraft ? "Updating…" : "Update"
          : saving ? "Scheduling…" : status === "DRAFT" ? "Activate and schedule" : "Create"}
      </Button>
    </div>
  );
}

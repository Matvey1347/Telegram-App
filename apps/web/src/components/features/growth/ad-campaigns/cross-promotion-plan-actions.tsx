"use client";

import { Save } from "lucide-react";
import type { CrossPromotionPlan } from "@telegram-system/shared";
import { Button, Tooltip } from "@/components/ui/primitives";
import type { CrossPromotionModalMode } from "./cross-promotion-modal-title";

export function CrossPromotionPlanActions({
  status,
  mode,
  saving,
  savingDraft,
  hasMultiplePublisherPosts,
  hasTitle,
  sharedPublicationChanged,
  requiresRepublish,
  onClose,
  onSaveDraft,
  onUpdateDetails,
  onReplaceAndPublishNow,
  onSubmit,
}: {
  status?: CrossPromotionPlan["status"];
  mode: CrossPromotionModalMode;
  saving: boolean;
  savingDraft: boolean;
  hasMultiplePublisherPosts: boolean;
  hasTitle: boolean;
  sharedPublicationChanged: boolean;
  requiresRepublish: boolean;
  onClose: () => void;
  onSaveDraft: () => void;
  onUpdateDetails?: () => void;
  onReplaceAndPublishNow?: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      {sharedPublicationChanged ? (
        <div className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          The shared partner post has changed. Updating this promotion will
          update that post in every linked Telegram channel.
        </div>
      ) : null}
      {requiresRepublish ? (
        <div className="rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          This published post did not have an inline button. Adding one requires
          publishing a new Telegram message, so use Delete and publish now
          instead of Update mutual promotion.
        </div>
      ) : null}
      {mode === "edit" && status === "SCHEDULED" ? (
        <div className="rounded-lg border border-amber-800/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
          Replacing scheduled posts deletes the current scheduled Telegram posts
          in every linked channel, then creates this version at the selected
          dates and times.
        </div>
      ) : null}
      <div className={mode === "create"
        ? "grid grid-flow-col auto-cols-fr gap-2 [&>button]:whitespace-normal [&>button]:px-2 sm:flex sm:justify-end sm:[&>button]:px-5"
        : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"}>
        {mode === "edit" ? (
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        ) : null}
        {!status || status === "DRAFT" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={saving || savingDraft}
            onClick={onSaveDraft}
          >
            <Save size={16} aria-hidden="true" />
            {savingDraft
              ? status === "DRAFT"
                ? "Updating draft…"
                : "Saving draft…"
              : status === "DRAFT"
                ? "Update draft"
                : "Save draft"}
          </Button>
        ) : null}
        {mode === "edit" && onUpdateDetails ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={saving || savingDraft || !hasTitle}
            onClick={onUpdateDetails}
          >
            {saving ? "Updating…" : "Update details"}
          </Button>
        ) : null}
        {mode === "edit" && onReplaceAndPublishNow && !hasMultiplePublisherPosts ? (
          <Tooltip
            content={
              status === "DRAFT"
                ? "No live publication was found. Publish this draft to every selected channel now."
                : "Need a completely new post? Delete the current publication in all linked channels and publish this version immediately."
            }
          >
            <span className="w-full sm:w-auto">
              <Button
                type="button"
                variant={status === "DRAFT" ? "primary" : "danger"}
                className="w-full sm:w-auto"
                disabled={saving || savingDraft}
                onClick={onReplaceAndPublishNow}
              >
                {status === "DRAFT" ? "Publish now" : "Delete and publish now"}
              </Button>
            </span>
          </Tooltip>
        ) : null}
        {status === "DRAFT" ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={saving || savingDraft || requiresRepublish}
            onClick={onSubmit}
          >
            {saving ? "Activating…" : "Activate and schedule"}
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={saving || savingDraft || requiresRepublish}
            onClick={onSubmit}
          >
            {saving
              ? mode === "edit"
                ? "Updating…"
                : "Scheduling…"
              : mode === "edit"
                ? status === "SCHEDULED"
                  ? "Replace scheduled posts"
                  : requiresRepublish
                    ? "Republish required"
                    : "Update mutual promotion"
                : "Create"}
          </Button>
        )}
      </div>
    </>
  );
}

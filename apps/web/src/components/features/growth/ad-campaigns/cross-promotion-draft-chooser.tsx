"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { useWorkspaceModalDraftList } from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import type { PromotionKind } from "./cross-promotion-create-steps";
import { normalizeCrossPromotionModalDraft } from "./cross-promotion-plan-draft";
import { normalizeFolderDraft } from "./mutual-promotion/mutual-promotion-form-types";
import { promotionDraftNamespace } from "./promotion-draft-namespace";

type DraftChooserProps = {
  kind: PromotionKind;
  onOpen: (draftId: string | null) => void;
};

export function CrossPromotionDraftChooser(props: DraftChooserProps) {
  const workspaceId = selectedWorkspaceDraftScope();
  return <PromotionDraftInbox key={`${workspaceId}:${props.kind}`} workspaceId={workspaceId} {...props} />;
}

function PromotionDraftInbox({ kind, onOpen, workspaceId }: DraftChooserProps & { workspaceId: string }) {
  const { drafts, deleteDraft } = useWorkspaceModalDraftList<{ title: string }>({
    namespace: promotionDraftNamespace(kind),
    workspaceId,
    schemaVersion: 1,
    normalize: kind === "FOLDER" ? normalizeFolderDraft : normalizeCrossPromotionModalDraft,
  });
  const create = () => onOpen(null);
  if (!drafts.length) {
    return <Button type="button" onClick={create}><Plus size={16} /> Create new</Button>;
  }
  return (
    <ModalDraftPicker
      drafts={drafts}
      titleFor={(form) => form.title?.trim() || "Untitled draft"}
      onDelete={deleteDraft}
      onContinue={(draft) => onOpen(draft.id)}
      onCreateNew={create}
    />
  );
}

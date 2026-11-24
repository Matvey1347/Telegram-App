import { Pencil } from "lucide-react";
import { Button, IconButton } from "@/components/ui/primitives";

export const settingsCardGrid =
  "grid min-w-0 items-start grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] gap-2";
export const settingsCardRow = "flex min-w-0 flex-wrap items-center gap-2 p-2";
export const settingsCardContent =
  "flex min-w-0 grow basis-48 items-center gap-2 text-left";
export const settingsCardTitle = "block font-semibold text-white [overflow-wrap:anywhere]";
export const settingsCardDetails = "mt-0.5 block text-xs text-neutral-400 [overflow-wrap:anywhere]";

export function AiPostingSettingsCardActions({
  onEdit,
  editLabel,
  onDelete,
  deleteLabel,
  deleteTitle,
}: {
  onEdit: () => void;
  editLabel: string;
  onDelete?: () => void;
  deleteLabel?: string;
  deleteTitle?: string;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <Button type="button" variant="secondary" className="size-10 !p-0" aria-label={editLabel} onClick={onEdit}>
        <Pencil size={15} aria-hidden="true" />
      </Button>
      {onDelete && (
        <IconButton type="button" kind="delete" aria-label={deleteLabel} title={deleteTitle} onClick={onDelete} />
      )}
    </div>
  );
}

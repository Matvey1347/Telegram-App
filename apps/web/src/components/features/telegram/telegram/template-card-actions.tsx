import { Pencil, Trash2 } from "lucide-react";

export function TemplateCardActions({
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
  deleteDisabled = false,
}: {
  editLabel: string;
  deleteLabel: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-700 text-white hover:bg-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={editLabel}
        title={editLabel}
        onClick={onEdit}
      >
        <Pencil size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={deleteLabel}
        title={deleteLabel}
        disabled={deleteDisabled}
        onClick={onDelete}
      >
        <Trash2 size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  );
}

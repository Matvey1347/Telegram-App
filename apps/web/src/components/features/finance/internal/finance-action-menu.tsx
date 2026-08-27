"use client";

import { Pencil, Trash2 } from "lucide-react";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";

export function FinanceActionMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <TelegramCardActionsMenu label={`Actions for ${label}`}>
      <TelegramCardMenuAction label="Edit" icon={<Pencil size={16} />} onClick={onEdit} />
      {onDelete ? (
        <TelegramCardMenuAction danger label="Delete" icon={<Trash2 size={16} />} onClick={onDelete} />
      ) : null}
    </TelegramCardActionsMenu>
  );
}

"use client";

import { Pencil, Trash2, type LucideIcon } from "lucide-react";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "@/components/features/telegram/telegram/telegram-card-actions-menu";

export function FinanceActionMenu({
  label,
  onEdit,
  onDelete,
  destructiveActionLabel = "Delete",
  destructiveActionIcon: ActionIcon = Trash2,
  destructive = true,
}: {
  label: string;
  onEdit: () => void;
  onDelete?: () => void;
  destructiveActionLabel?: string;
  destructiveActionIcon?: LucideIcon;
  destructive?: boolean;
}) {
  return (
    <TelegramCardActionsMenu label={`Actions for ${label}`}>
      <TelegramCardMenuAction label="Edit" icon={<Pencil size={16} />} onClick={onEdit} />
      {onDelete ? (
        <TelegramCardMenuAction
          danger={destructive}
          label={destructiveActionLabel}
          icon={<ActionIcon size={16} />}
          onClick={onDelete}
        />
      ) : null}
    </TelegramCardActionsMenu>
  );
}

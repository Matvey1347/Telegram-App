"use client";

import type {
  TelegramAdSale,
  TelegramAdSalePlacement,
} from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";

export type SaleActionKey =
  | "reserve"
  | "confirm"
  | "cancel"
  | "register-payment"
  | "create-post"
  | "attach-post"
  | "schedule"
  | "publish"
  | "complete-permanent"
  | "reschedule";

export function allowedSaleActions(
  sale: TelegramAdSale,
  placement?: TelegramAdSalePlacement | null,
): SaleActionKey[] {
  if (!placement) {
    const actions: SaleActionKey[] = ["register-payment"];
    if (sale.status === "DRAFT") actions.unshift("reserve");
    if (sale.status === "RESERVED") actions.unshift("confirm");
    if (
      sale.status === "DRAFT" ||
      sale.status === "RESERVED" ||
      sale.status === "CONFIRMED" ||
      sale.status === "IN_PROGRESS"
    ) {
      actions.push("cancel");
    }
    return actions;
  }

  const actions: SaleActionKey[] = [];
  if (!placement.managedPostId) {
    actions.push("create-post", "attach-post");
  }
  if (placement.status === "RESERVED" && placement.managedPostId) {
    actions.push("schedule");
  }
  if (placement.status === "SCHEDULED") {
    actions.push("publish", "reschedule");
  }
  if (placement.status === "PUBLISHED" && placement.isPermanentSnapshot) {
    actions.push("complete-permanent");
  }
  return actions;
}

export function SaleStatusActions({
  sale,
  placement,
  onAction,
  hidePayment = false,
  hideSchedule = false,
}: {
  sale: TelegramAdSale;
  placement?: TelegramAdSalePlacement | null;
  onAction: (action: SaleActionKey) => void;
  hidePayment?: boolean;
  hideSchedule?: boolean;
}) {
  const actions = allowedSaleActions(sale, placement).filter(
    (action) =>
      (!hidePayment || action !== "register-payment") &&
      (!hideSchedule || action !== "schedule"),
  );

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          variant={action === "cancel" ? "danger" : "secondary"}
          onClick={() => onAction(action)}
          className="capitalize"
        >
          {action.replaceAll("-", " ")}
        </Button>
      ))}
    </div>
  );
}

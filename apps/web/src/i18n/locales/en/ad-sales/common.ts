import type { TranslationCatalog } from "@/i18n/types";

const messages = {
  "adSales.status.draft": "Draft",
  "adSales.status.reserved": "Reserved",
  "adSales.status.confirmed": "Confirmed",
  "adSales.status.inProgress": "In progress",
  "adSales.status.completed": "Completed",
  "adSales.status.cancelled": "Cancelled",
  "adSales.placementStatus.draft": "Draft",
  "adSales.placementStatus.reserved": "Reserved",
  "adSales.placementStatus.scheduled": "Scheduled",
  "adSales.placementStatus.published": "Published",
  "adSales.placementStatus.completed": "Completed",
  "adSales.placementStatus.cancelled": "Cancelled",
  "adSales.placementStatus.missed": "Missed",
  "adSales.status.unpaid": "Unpaid",
  "adSales.status.partiallyPaid": "Partially paid",
  "adSales.status.paid": "Paid",
  "adSales.status.overpaid": "Overpaid",
} as const satisfies TranslationCatalog;

export default messages;

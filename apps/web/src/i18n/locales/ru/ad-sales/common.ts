import type en from "@/i18n/locales/en/ad-sales/common";

const messages = {
  "adSales.status.draft": "Черновик",
  "adSales.status.reserved": "Зарезервировано",
  "adSales.status.confirmed": "Подтверждено",
  "adSales.status.inProgress": "В работе",
  "adSales.status.completed": "Завершено",
  "adSales.status.cancelled": "Отменено",
  "adSales.placementStatus.draft": "Черновик",
  "adSales.placementStatus.reserved": "Зарезервировано",
  "adSales.placementStatus.scheduled": "Запланировано",
  "adSales.placementStatus.published": "Опубликовано",
  "adSales.placementStatus.completed": "Завершено",
  "adSales.placementStatus.cancelled": "Отменено",
  "adSales.placementStatus.missed": "Пропущено",
  "adSales.status.unpaid": "Не оплачено",
  "adSales.status.partiallyPaid": "Оплачено частично",
  "adSales.status.paid": "Оплачено",
  "adSales.status.overpaid": "Переплата",
} as const satisfies Record<keyof typeof en, string>;

export default messages;

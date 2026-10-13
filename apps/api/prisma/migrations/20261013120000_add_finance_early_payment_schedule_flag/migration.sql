ALTER TABLE "FinanceRecurringPaymentOccurrence"
  ADD COLUMN "advancesSchedule" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "FinanceRecurringPaymentOccurrence_payment_scheduled_key";

CREATE UNIQUE INDEX "FinanceRecurringPaymentOccurrence_schedule_adv_key"
  ON "FinanceRecurringPaymentOccurrence"("recurringPaymentId", "scheduledFor", "advancesSchedule");

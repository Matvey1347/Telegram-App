-- Keeps bounded merchant-pattern and anomaly aggregates index-assisted.
CREATE INDEX "FinanceTransaction_profileId_merchantNormalized_occurredAt_idx"
ON "FinanceTransaction"("profileId", "merchantNormalized", "occurredAt");

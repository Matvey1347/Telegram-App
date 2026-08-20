CREATE TABLE "FinanceConsumerTransfer" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceConsumerTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceConsumerTransfer_tokenHash_key" ON "FinanceConsumerTransfer"("tokenHash");
CREATE INDEX "FinanceConsumerTransfer_expiresAt_idx" ON "FinanceConsumerTransfer"("expiresAt");
ALTER TABLE "FinanceConsumerTransfer" ADD CONSTRAINT "FinanceConsumerTransfer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "FinanceProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

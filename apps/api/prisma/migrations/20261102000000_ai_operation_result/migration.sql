CREATE TABLE "AiOperationResult" (
  "operationDbId" TEXT NOT NULL,
  "version" VARCHAR(80) NOT NULL,
  "output" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiOperationResult_pkey" PRIMARY KEY ("operationDbId"),
  CONSTRAINT "AiOperationResult_operationDbId_fkey" FOREIGN KEY ("operationDbId") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

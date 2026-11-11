import { BadGatewayException } from '@nestjs/common';

type RunOperation = {
  operationId: string;
  [key: string]: unknown;
};

export function telegramAiPostingOperationFromError<T extends RunOperation>(
  error: unknown,
): T | null {
  if (!(error instanceof BadGatewayException)) return null;
  const response = error.getResponse();
  if (!response || typeof response !== 'object' || !('operation' in response))
    return null;
  const operation = (response as { operation?: RunOperation }).operation;
  return operation && typeof operation.operationId === 'string'
    ? (operation as T)
    : null;
}

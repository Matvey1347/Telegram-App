import { AsyncLocalStorage } from 'node:async_hooks';

/** Request-owner cancellation shared by bounded transport adapters. */
export const telegramOperationSignal = new AsyncLocalStorage<AbortSignal>();
